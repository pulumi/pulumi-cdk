// Copyright 2016-2022, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as cx from 'aws-cdk-lib/cx-api';
import * as cloud_assembly from 'aws-cdk-lib/cloud-assembly-schema';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as docker from '@pulumi/docker';
import {
    ecs,
    iam,
    apprunner,
    lambda,
    cidr,
    getAccountId,
    getPartition,
    getAzs,
    getRegion,
    getSsmParameterList,
    getSsmParameterString,
    getUrlSuffix,
} from '@pulumi/aws-native';
import { debug } from '@pulumi/pulumi/log';
import { CfnElement, Token, Reference, Tokenization } from 'aws-cdk-lib';
import { Construct, ConstructOrder, Node, IConstruct } from 'constructs';
import { mapToAwsResource } from './aws-resource-mappings';
import { CloudFormationResource, CloudFormationTemplate, getDependsOn } from './cfn';
import { attributePropertyName, mapToCfnResource } from './cfn-resource-mappings';
import { GraphBuilder } from './graph';
import {
    CfnResource,
    CdkConstruct,
    JSII_RUNTIME_SYMBOL,
    ResourceMapping,
    normalize,
    firstToLower,
    getFqn,
} from './interop';
import { OutputRepr, OutputMap } from './output-map';
import { parseSub } from './sub';
import { zipDirectory } from './zip';

/**
 * Options specific to the Stack component.
 */
export interface StackOptions extends pulumi.ComponentResourceOptions {
    /**
     * Defines a mapping to override and/or provide an implementation for a CloudFormation resource
     * type that is not (yet) implemented in the AWS Cloud Control API (and thus not yet available in
     * the Pulumi AWS Native provider). Pulumi code can override this method to provide a custom mapping
     * of CloudFormation elements and their properties into Pulumi CustomResources, commonly by using the
     * AWS Classic provider to implement the missing resource.
     *
     * @param element The full CloudFormation element object being mapped.
     * @param logicalId The logical ID of the resource being mapped.
     * @param typeName The CloudFormation type name of the resource being mapped.
     * @param props The bag of input properties to the CloudFormation resource being mapped.
     * @param options The set of Pulumi ResourceOptions to apply to the resource being mapped.
     * @returns An object containing one or more logical IDs mapped to Pulumi resources that must be
     * created to implement the mapped CloudFormation resource, or else undefined if no mapping is
     * implemented.
     */
    remapCloudControlResource?(
        element: CfnElement,
        logicalId: string,
        typeName: string,
        props: any,
        options: pulumi.ResourceOptions,
    ): ResourceMapping | undefined;
}

/**
 * A Pulumi Component that represents an AWS CDK stack deployed with Pulumi.
 */
export class Stack extends pulumi.ComponentResource {
    /**
     * The collection of outputs from the AWS CDK Stack represented as Pulumi Outputs.
     * Each CfnOutput defined in the AWS CDK Stack will populate a value in the outputs.
     */
    outputs: { [outputId: string]: pulumi.Output<any> } = {};

    /** @internal */
    name: string;

    /**
     * Create and register an AWS CDK stack deployed with Pulumi.
     *
     * @param name The _unique_ name of the resource.
     * @param stack The CDK Stack subclass to create.
     * @param options A bag of options that control this resource's behavior.
     */
    constructor(name: string, stack: typeof cdk.Stack, options?: StackOptions) {
        super('cdk:index:Stack', name, {}, options);
        this.name = name;

        const app = new cdk.App({
            context: {
                // Ask CDK to attach 'aws:asset:*' metadata to resources in generated stack templates. Although this
                // metadata is not currently used, it may be useful in the future to map between assets and the
                // resources with which they are associated. For example, the lambda.Function L2 construct attaches
                // metadata for its Code asset (if any) to its generated CFN resource.
                [cx.ASSET_RESOURCE_METADATA_ENABLED_CONTEXT]: true,

                // Ask CDK to embed 'aws:cdk:path' metadata in resources in generated stack templates. Although this
                // metadata is not currently used, it provides an aditional mechanism by which we can map between
                // constructs and the resources they emit in the CFN template.
                [cx.PATH_METADATA_ENABLE_CONTEXT]: true,
            },
        });

        new stack(app, 'stack');
        const assembly = app.synth();

        debug(JSON.stringify(debugAssembly(assembly)));

        AppConverter.convert(this, app, assembly, options || {});

        this.registerOutputs(this.outputs);
    }

    /** @internal */
    registerOutput(outputId: string, output: any) {
        this.outputs[outputId] = pulumi.output(output);
    }
}

type Mapping<T extends pulumi.Resource> = {
    resource: T;
    resourceType: string;
    attributes?: { [name: string]: pulumi.Input<any> };
};

class AppConverter {
    readonly stacks = new Map<string, StackConverter>();
    readonly stackTemplates = new Set<string>();
    readonly s3Assets = new Map<string, cdk.aws_s3_assets.Asset>();

    constructor(
        readonly host: Stack,
        readonly app: cdk.App,
        readonly assembly: cx.CloudAssembly,
        readonly options: StackOptions,
    ) { }

    public static convert(host: Stack, app: cdk.App, assembly: cx.CloudAssembly, options: StackOptions) {
        const converter = new AppConverter(host, app, assembly, options);
        converter.convert();
    }

    private convert() {
        // Build a lookup table for the app's stacks.
        for (const construct of this.app.node.findAll()) {
            if (cdk.Stack.isStack(construct)) {
                const artifact = this.assembly.getStackArtifact(construct.artifactId);
                const stack = new StackConverter(this, construct, artifact);
                this.stacks.set(construct.artifactId, stack);
                this.stackTemplates.add(artifact.templateFullPath);
                debug(`${artifact.templateFullPath} is a stack template`);

                for (const asset of stack.findS3Assets()) {
                    debug(`${path.join(this.assembly.directory, asset.assetPath)} -> ${asset.node.path}`);
                    this.s3Assets.set(path.join(this.assembly.directory, asset.assetPath), asset);
                }
            }
        }

        // Process stack artifacts in dependency order.
        const done = new Map<cx.CloudArtifact, ArtifactConverter>();
        for (const stack of this.assembly.artifacts.filter(
            (a) => a.manifest.type === cloud_assembly.ArtifactType.AWS_CLOUDFORMATION_STACK,
        )) {
            this.convertArtifact(stack, done);
        }
    }

    private convertArtifact(
        artifact: cx.CloudArtifact,
        done: Map<cx.CloudArtifact, ArtifactConverter>,
    ): ArtifactConverter | undefined {
        if (done.has(artifact)) {
            return done.get(artifact)!;
        }

        const dependencies = new Set<ArtifactConverter>();
        for (const d of artifact.dependencies) {
            const c = this.convertArtifact(d, done);
            if (c !== undefined) {
                debug(`${artifact.id} depends on ${d.id}`);
                dependencies.add(c);
            }
        }

        switch (artifact.manifest.type) {
            case cloud_assembly.ArtifactType.ASSET_MANIFEST:
                return this.convertAssetManifest(artifact as cx.AssetManifestArtifact, dependencies);
            case cloud_assembly.ArtifactType.AWS_CLOUDFORMATION_STACK:
                return this.convertStack(artifact as cx.CloudFormationStackArtifact, dependencies);
            default:
                debug(`attempting to convert artifact ${artifact.id} with unsupported type ${artifact.manifest.type}`);
                return undefined;
        }
    }

    private convertStack(
        artifact: cx.CloudFormationStackArtifact,
        dependencies: Set<ArtifactConverter>,
    ): StackConverter {
        const stack = this.stacks.get(artifact.id);
        if (stack === undefined) {
            throw new Error(`missing CDK Stack for artifact ${artifact.id}`);
        }
        stack.convert(dependencies);
        return stack;
    }

    private convertAssetManifest(
        artifact: cx.AssetManifestArtifact,
        dependencies: Set<ArtifactConverter>,
    ): ArtifactConverter {
        const converter = new AssetManifestConverter(this, cloud_assembly.Manifest.loadAssetManifest(artifact.file));
        converter.convert();
        return converter;
    }
}

class ArtifactConverter {
    constructor(readonly app: AppConverter) { }
}

class AssetManifestConverter extends ArtifactConverter {
    public readonly files = new Map<string, aws.s3.BucketObjectv2[]>();
    public readonly dockerImages = new Map<string, docker.Image[]>();

    constructor(app: AppConverter, readonly manifest: cloud_assembly.AssetManifest) {
        super(app);
    }

    public convert() {
        for (const [id, file] of Object.entries(this.manifest.files || {})) {
            this.convertFile(id, file);
        }

        for (const [id, image] of Object.entries(this.manifest.dockerImages || {})) {
            this.convertDockerImage(id, image);
        }
    }

    private convertFile(id: string, asset: cloud_assembly.FileAsset) {
        if (asset.source.executable !== undefined) {
            throw new Error(`file assets produced by commands are not yet supported`);
        }

        const inputPath = path.join(this.app.assembly.directory, asset.source.path!);
        if (this.app.stackTemplates.has(inputPath)) {
            // Ignore stack templates.
            return;
        }

        const s3Asset = this.app.s3Assets.get(inputPath);
        const name = s3Asset?.node.path || id;

        const outputPath =
            asset.source.packaging === cloud_assembly.FileAssetPackaging.FILE
                ? Promise.resolve(inputPath)
                : zipDirectory(inputPath, inputPath + '.zip');

        const objects = Object.entries(asset.destinations).map(
            ([destId, d]) =>
                new aws.s3.BucketObjectv2(
                    `${this.app.host.name}/${name}/${destId}`,
                    {
                        source: outputPath,
                        bucket: this.resolvePlaceholders(d.bucketName),
                        key: this.resolvePlaceholders(d.objectKey),
                    },
                    { parent: this.app.host },
                ),
        );

        this.files.set(id, objects);
    }

    private convertDockerImage(id: string, asset: cloud_assembly.DockerImageAsset) {
        debug('TODO: convert docker image asset');
    }

    private resolvePlaceholders(s: string): Promise<string> {
        const app = this.app;
        return cx.EnvironmentPlaceholders.replaceAsync(s, {
            async region(): Promise<string> {
                return getRegion({ parent: app.host }).then((r) => r.region);
            },

            async accountId(): Promise<string> {
                return getAccountId({ parent: app.host }).then((r) => r.accountId);
            },

            async partition(): Promise<string> {
                return getPartition({ parent: app.host }).then((p) => p.partition);
            },
        });
    }
}

const s3AssetFqn = (<any>cdk.aws_s3_assets.Asset)[JSII_RUNTIME_SYMBOL]?.fqn;

function isS3Asset(construct: IConstruct): construct is cdk.aws_s3_assets.Asset {
    return s3AssetFqn !== undefined && getFqn(construct) === s3AssetFqn;
}

class StackConverter extends ArtifactConverter {
    readonly parameters = new Map<string, any>();
    readonly resources = new Map<string, Mapping<pulumi.Resource>>();
    readonly constructs = new Map<IConstruct, pulumi.Resource>();
    stackResource!: CdkConstruct;

    constructor(app: AppConverter, readonly stack: cdk.Stack, readonly artifact: cx.CloudFormationStackArtifact) {
        super(app);
    }

    public findS3Assets(): cdk.aws_s3_assets.Asset[] {
        return [...this.stack.node.findAll().filter(isS3Asset)];
    }

    public convert(dependencies: Set<ArtifactConverter>) {
        const dependencyGraphNodes = GraphBuilder.build(this.stack);
        for (const n of dependencyGraphNodes) {
            if (n.construct === this.stack) {
                this.stackResource = new CdkConstruct(`${this.app.host.name}/${n.construct.node.path}`, n.construct, {
                    parent: this.app.host,
                    dependsOn: this.stackDependsOn(dependencies),
                });
                this.constructs.set(n.construct, this.stackResource);
                continue;
            }

            const parent = this.constructs.get(n.construct.node.scope!)!;
            if (CfnElement.isCfnElement(n.construct)) {
                const cfn = n.template!;
                debug(`Processing node with template: ${JSON.stringify(cfn)}`);
                for (const [logicalId, value] of Object.entries(cfn.Parameters || {})) {
                    this.mapParameter(n.construct, logicalId, value.Type, value.Default);
                }
                for (const [logicalId, value] of Object.entries(cfn.Resources || {})) {
                    debug(`Creating resource for ${logicalId}`);
                    const props = this.processIntrinsics(value.Properties);
                    const options = this.processOptions(value, parent);

                    const mapped = this.mapResource(n.construct, logicalId, value.Type, props, options);
                    const resource = pulumi.Resource.isInstance(mapped) ? mapped : mapped.resource;
                    const attributes = pulumi.Resource.isInstance(mapped) ? undefined : mapped.attributes;
                    this.resources.set(logicalId, { resource, attributes, resourceType: value.Type });
                    this.constructs.set(n.construct, resource);

                    debug(`Done creating resource for ${logicalId}`);
                }
                for (const [conditionId, condition] of Object.entries(cfn.Conditions || {})) {
                    // Do something with the condition
                }
                // Register the outputs as outputs of the component resource.
                for (const [outputId, args] of Object.entries(cfn.Outputs || {})) {
                    this.app.host.registerOutput(outputId, this.processIntrinsics(args.Value));
                }
            } else {
                const r = new CdkConstruct(`${this.app.host.name}/${n.construct.node.path}`, n.construct, {
                    parent,
                });
                this.constructs.set(n.construct, r);
            }
        }

        for (let i = dependencyGraphNodes.length - 1; i >= 0; i--) {
            const n = dependencyGraphNodes[i];
            if (!CfnElement.isCfnElement(n.construct)) {
                (<CdkConstruct>this.constructs.get(n.construct)!).done();
            }
        }
    }

    private stackDependsOn(dependencies: Set<ArtifactConverter>): pulumi.Resource[] {
        const dependsOn: pulumi.Resource[] = [];
        for (const d of dependencies) {
            if (d instanceof AssetManifestConverter) {
                for (const objects of d.files.values()) {
                    dependsOn.push(...objects);
                }
                for (const images of d.dockerImages.values()) {
                    dependsOn.push(...images);
                }
            }
        }
        return dependsOn;
    }

    private mapParameter(element: CfnElement, logicalId: string, typeName: string, defaultValue: any | undefined) {
        // TODO: support arbitrary parameters?

        if (!typeName.startsWith('AWS::SSM::Parameter::')) {
            throw new Error(`unsupported parameter ${logicalId} of type ${typeName}`);
        }
        if (defaultValue === undefined) {
            throw new Error(`unsupported parameter ${logicalId} with no default value`);
        }

        function parameterValue(parent: pulumi.Resource): any {
            const key = defaultValue;
            const paramType = typeName.slice('AWS::SSM::Parameter::'.length);
            if (paramType.startsWith('Value<')) {
                const type = paramType.slice('Value<'.length);
                if (type.startsWith('List<') || type === 'CommaDelimitedList>') {
                    return getSsmParameterList({ name: key }, { parent }).then((v) => v.value);
                }
                return getSsmParameterString({ name: key }, { parent }).then((v) => v.value);
            }
            return key;
        }

        this.parameters.set(logicalId, parameterValue(this.app.host));
    }

    private mapResource(
        element: CfnElement,
        logicalId: string,
        typeName: string,
        props: any,
        options: pulumi.ResourceOptions,
    ): ResourceMapping {
        if (this.app.options.remapCloudControlResource !== undefined) {
            const res = this.app.options.remapCloudControlResource(element, logicalId, typeName, props, options);
            if (res !== undefined) {
                debug(`remapped ${logicalId}`);
                return res;
            }
        }

        const awsMapping = mapToAwsResource(element, logicalId, typeName, props, options);
        if (awsMapping !== undefined) {
            debug(`mapped ${logicalId} to classic AWS resource(s)`);
            return awsMapping;
        }

        return mapToCfnResource(element, logicalId, typeName, props, options);
    }

    private processOptions(resource: CloudFormationResource, parent: pulumi.Resource): pulumi.ResourceOptions {
        const dependsOn = getDependsOn(resource);
        return {
            parent: parent,
            dependsOn: dependsOn !== undefined ? dependsOn.map((id) => this.resources.get(id)!.resource) : undefined,
        };
    }

    private processIntrinsics(obj: any): any {
        debug(`Processing intrinsics for ${JSON.stringify(obj)}`);
        if (typeof obj === 'string') {
            if (Token.isUnresolved(obj)) {
                debug(`Unresolved: ${JSON.stringify(obj)}`);
                return this.stack.resolve(obj);
            }
            return obj;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.filter((x) => !this.isNoValue(x)).map((x) => this.processIntrinsics(x));
        }

        const ref = obj.Ref;
        if (ref) {
            return this.resolveRef(ref);
        }

        const keys = Object.keys(obj);
        if (keys.length == 1 && keys[0]?.startsWith('Fn::')) {
            return this.resolveIntrinsic(keys[0], obj[keys[0]]);
        }

        return Object.entries(obj)
            .filter(([_, v]) => !this.isNoValue(v))
            .reduce((result, [k, v]) => ({ ...result, [k]: this.processIntrinsics(v) }), {});
    }

    private isNoValue(obj: any): boolean {
        return obj?.Ref === 'AWS::NoValue';
    }

    private resolveOutput(repr: OutputRepr): pulumi.Output<any> {
        return OutputMap.instance().lookupOutput(repr)!;
    }

    private resolveIntrinsic(fn: string, params: any) {
        switch (fn) {
            case 'Fn::GetAtt': {
                debug(`Fn::GetAtt(${params[0]}, ${firstToLower(params[1])})`);
                return this.resolveAtt(params[0], firstToLower(params[1]));
            }

            case 'Fn::Join':
                return lift(([delim, strings]) => strings.join(delim), this.processIntrinsics(params));

            case 'Fn::Select':
                return lift(([index, list]) => list[index], this.processIntrinsics(params));

            case 'Fn::Split':
                return lift(([delim, str]) => str.split(delim), this.processIntrinsics(params));

            case 'Fn::Base64':
                return lift(([str]) => Buffer.from(str).toString('base64'), this.processIntrinsics(params));

            case 'Fn::Cidr':
                return lift(
                    ([ipBlock, count, cidrBits]) =>
                        cidr({
                            ipBlock,
                            count,
                            cidrBits,
                        }).then((r) => r.subnets),
                    this.processIntrinsics(params),
                );

            case 'Fn::GetAZs':
                return lift(([region]) => getAzs({ region }).then((r) => r.azs), this.processIntrinsics(params));

            case 'Fn::Sub':
                return lift((params) => {
                    const [template, vars] =
                        typeof params === 'string' ? [params, undefined] : [params[0] as string, params[1]];

                    const parts = [];
                    for (const part of parseSub(template)) {
                        parts.push(part.str);

                        if (part.ref !== undefined) {
                            if (part.ref.attr !== undefined) {
                                parts.push(this.resolveAtt(part.ref.id, part.ref.attr!));
                            } else {
                                parts.push(this.resolveRef(part.ref.id));
                            }
                        }
                    }

                    return lift((parts) => parts.map((v: any) => v.toString()).join(''), parts);
                }, this.processIntrinsics(params));

            case 'Fn::Transform': {
                // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-macros.html
                throw new Error('Fn::Transform is not supported – Cfn Template Macros are not supported yet');
            }

            case 'Fn::ImportValue': {
                // TODO: support cross cfn stack references?
                // This is related to the Export Name from outputs https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html
                // We might revisit this once the CDKTF supports cross stack references
                throw new Error(`Fn::ImportValue is not yet supported.`);
            }

            default:
                throw new Error(`unsupported intrinsic function ${fn} (params: ${JSON.stringify(params)})`);
        }
    }

    private resolveRef(target: any): any {
        if (typeof target !== 'string') {
            return this.resolveOutput(<OutputRepr>target);
        }

        switch (target) {
            case 'AWS::AccountId':
                return getAccountId({ parent: this.app.host }).then((r) => r.accountId);
            case 'AWS::NoValue':
                return undefined;
            case 'AWS::Partition':
                // TODO: this is tricky b/c it seems to be context-dependent. From the docs:
                //
                //     Returns the partition that the resource is in. For standard AWS Regions, the partition is aws.
                //     For resources in other partitions, the partition is aws-partitionname.
                //
                // For now, just return 'aws'. In the future, we may need to keep track of the type of the resource
                // we're walking and then ask the provider via an invoke.
                return 'aws';
            case 'AWS::Region':
                return getRegion({ parent: this.app.host }).then((r) => r.region);
            case 'AWS::URLSuffix':
                return getUrlSuffix({ parent: this.app.host }).then((r) => r.urlSuffix);
            case 'AWS::NotificationARNs':
            case 'AWS::StackId':
            case 'AWS::StackName':
                // Can't support these
                throw new Error(`reference to unsupported pseudo parameter ${target}`);
        }

        const mapping = this.lookup(target);
        if ((<any>mapping).value !== undefined) {
            return (<any>mapping).value;
        }
        return (<pulumi.CustomResource>(<Mapping<pulumi.Resource>>mapping).resource).id;
    }

    private lookup(logicalId: string): Mapping<pulumi.Resource> | { value: any } {
        const targetParameter = this.parameters.get(logicalId);
        if (targetParameter !== undefined) {
            return { value: targetParameter };
        }
        const targetMapping = this.resources.get(logicalId);
        if (targetMapping !== undefined) {
            return targetMapping;
        }
        throw new Error(`missing reference for ${logicalId}`);
    }

    private resolveAtt(logicalId: string, attribute: string) {
        const mapping = <Mapping<pulumi.Resource>>this.lookup(logicalId);

        debug(
            `Resource: ${logicalId} - resourceType: ${mapping.resourceType} - ${Object.getOwnPropertyNames(
                mapping.resource,
            )}`,
        );

        // If this resource has explicit attribute mappings, those mappings will use PascalCase, not camelCase.
        const propertyName = mapping.attributes !== undefined ? attribute : attributePropertyName(attribute);

        const descs = Object.getOwnPropertyDescriptors(mapping.attributes || mapping.resource);
        const d = descs[propertyName];
        if (!d) {
            throw new Error(`No property ${propertyName} for attribute ${attribute} on resource ${logicalId}`);
        }
        return d.value;
    }
}

function containsEventuals(v: any): boolean {
    if (typeof v !== 'object') {
        return false;
    }

    if (v instanceof Promise || pulumi.Output.isInstance(v)) {
        return true;
    }

    if (Array.isArray(v)) {
        return v.some((e) => containsEventuals(e));
    }

    return Object.values(v).some((e) => containsEventuals(e));
}

function lift(f: (args: any) => any, args: any): any {
    if (!containsEventuals(args)) {
        return f(args);
    }
    return pulumi.all(args).apply(f);
}

function debugAssembly(assembly: cx.CloudAssembly): any {
    return {
        version: assembly.version,
        directory: assembly.directory,
        runtime: assembly.runtime,
        artifacts: assembly.artifacts.map(debugArtifact),
    };
}

function debugArtifact(artifact: cx.CloudArtifact): any {
    return {
        dependencies: artifact.dependencies.map((artifact) => artifact.id),
        manifest: artifact.manifest,
        messages: artifact.messages,
    };
}
