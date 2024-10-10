import * as pulumi from '@pulumi/pulumi';
import { AssemblyManifestReader, StackManifest } from '../assembly';
import { ConstructInfo, GraphBuilder } from '../graph';
import { StackComponentResource, lift, Mapping } from '../types';
import { ArtifactConverter } from './artifact-converter';
import { CdkConstruct, ResourceMapping } from '../interop';
import { debug } from '@pulumi/pulumi/log';
import {
    cidr,
    getAccountId,
    getAzs,
    getRegion,
    getSsmParameterList,
    getSsmParameterString,
    getUrlSuffix,
} from '@pulumi/aws-native';
import { mapToAwsResource } from '../aws-resource-mappings';
import { attributePropertyName, mapToCfnResource } from '../cfn-resource-mappings';
import { CloudFormationResource, getDependsOn } from '../cfn';
import { OutputMap, OutputRepr } from '../output-map';
import { parseSub } from '../sub';
import { getPartition } from '@pulumi/aws-native/getPartition';

/**
 * AppConverter will convert all CDK resources into Pulumi resources.
 */
export class AppConverter {
    // Map of stack artifactId to StackConverter
    public readonly stacks = new Map<string, StackConverter>();

    public readonly manifestReader: AssemblyManifestReader;

    constructor(readonly host: StackComponentResource) {
        this.manifestReader = AssemblyManifestReader.fromDirectory(host.assemblyDir);
    }

    convert() {
        const assetStackIds = this.host.dependencies.flatMap((dep) => dep.name);
        const stackManifests: StackManifest[] = [];
        for (const stackManifest of this.manifestReader.stackManifests) {
            // Don't process artifact manifests
            if (assetStackIds.includes(stackManifest.id)) continue;
            stackManifests.push(stackManifest);

            const stackConverter = new StackConverter(this.host, stackManifest);
            this.stacks.set(stackManifest.id, stackConverter);
        }

        for (const stack of stackManifests) {
            const done: { [artifactId: string]: StackConverter } = {};
            this.convertStackManifest(stack, done);
        }
    }

    private convertStackManifest(
        artifact: StackManifest,
        done: { [artifactId: string]: StackConverter },
    ): StackConverter | undefined {
        if (artifact.id in done) {
            return done[artifact.id];
        }

        const dependencies = new Set<ArtifactConverter>();
        for (const d of artifact.dependencies) {
            const converter = this.stacks.get(d);
            if (converter) {
                const c = this.convertStackManifest(converter.stack, done);
                if (c !== undefined) {
                    debug(`${artifact.id} depends on ${d}`);
                    dependencies.add(c);
                }
            }
        }

        const stackConverter = this.stacks.get(artifact.id);
        if (!stackConverter) {
            throw new Error(`missing CDK Stack for artifact ${artifact.id}`);
        }
        stackConverter.convert(dependencies);
        done[artifact.id] = stackConverter;
        return stackConverter;
    }
}

/**
 * StackConverter converts all of the resources in a CDK stack to Pulumi resources
 */
export class StackConverter extends ArtifactConverter {
    readonly parameters = new Map<string, any>();
    readonly resources = new Map<string, Mapping<pulumi.Resource>>();
    readonly constructs = new Map<ConstructInfo, pulumi.Resource>();

    private _stackResource?: CdkConstruct;

    public get stackResource(): CdkConstruct {
        if (!this._stackResource) {
            throw new Error('StackConverter has no stack resource');
        }
        return this._stackResource;
    }

    constructor(private readonly host: StackComponentResource, readonly stack: StackManifest) {
        super(host);
    }

    public convert(dependencies: Set<ArtifactConverter>) {
        const dependencyGraphNodes = GraphBuilder.build(this.stack);

        // process parameters first because resources will reference them
        for (const [logicalId, value] of Object.entries(this.stack.parameters ?? {})) {
            this.mapParameter(logicalId, value.Type, value.Default);
        }

        for (const n of dependencyGraphNodes) {
            if (n.construct.id === this.stack.id) {
                this._stackResource = new CdkConstruct(
                    `${this.stackComponent.name}/${n.construct.path}`,
                    n.construct.id,
                    {
                        parent: this.stackComponent,
                        // NOTE: Currently we make the stack depend on all the assets and then all resources
                        // have the parent as the stack. This means we deploy all assets before we deploy any resources
                        // we might be able better and have individual resources depend on individual assets, but CDK
                        // doesn't track asset dependencies at that level
                        dependsOn: this.stackDependsOn(dependencies),
                    },
                );
                this.constructs.set(n.construct, this._stackResource);
                continue;
            }

            if (!n.construct.parent || !this.constructs.has(n.construct.parent)) {
                throw new Error(`Construct at path ${n.construct.path} should be created in the scope of a Stack`);
            }
            const parent = this.constructs.get(n.construct.parent)!;
            if (n.resource && n.logicalId) {
                const cfn = n.resource;
                debug(`Processing node with template: ${JSON.stringify(cfn)}`);
                debug(`Creating resource for ${n.logicalId}`);
                const props = this.processIntrinsics(cfn.Properties);
                const options = this.processOptions(cfn, parent);

                const mapped = this.mapResource(n.logicalId, cfn.Type, props, options);
                mapped.forEach((m) => {
                    const resource = pulumi.Resource.isInstance(m) ? m : m.resource;
                    const attributes = pulumi.Resource.isInstance(m) ? undefined : m.attributes;
                    this.resources.set(n.logicalId!, { resource, attributes, resourceType: cfn.Type });
                    this.constructs.set(n.construct, resource);
                });

                debug(`Done creating resource for ${n.logicalId}`);
                // TODO: process template conditions
                // for (const [conditionId, condition] of Object.entries(cfn.Conditions || {})) {
                //     // Do something with the condition
                // }
            } else {
                const r = new CdkConstruct(`${this.stackComponent.name}/${n.construct.path}`, n.construct.type, {
                    parent,
                });
                this.constructs.set(n.construct, r);
            }
        }

        // Register the outputs as outputs of the component resource.
        for (const [outputId, args] of Object.entries(this.stack.outputs ?? {})) {
            this.stackComponent.registerOutput(outputId, this.processIntrinsics(args.Value));
        }

        for (let i = dependencyGraphNodes.length - 1; i >= 0; i--) {
            const n = dependencyGraphNodes[i];
            if (!n.resource) {
                (<CdkConstruct>this.constructs.get(n.construct)!).done();
            }
        }
    }

    private stackDependsOn(dependencies: Set<ArtifactConverter>): pulumi.Resource[] {
        const dependsOn: pulumi.Resource[] = [];
        dependsOn.push(...this.host.dependencies);
        for (const d of dependencies) {
            if (d instanceof StackConverter) {
                dependsOn.push(d.stackResource);
            }
        }
        return dependsOn;
    }

    private mapParameter(logicalId: string, typeName: string, defaultValue: any | undefined) {
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

        this.parameters.set(logicalId, parameterValue(this.stackComponent));
    }

    private mapResource(
        logicalId: string,
        typeName: string,
        props: any,
        options: pulumi.ResourceOptions,
    ): ResourceMapping[] {
        if (this.stackComponent.options?.remapCloudControlResource !== undefined) {
            const res = this.stackComponent.options.remapCloudControlResource(logicalId, typeName, props, options);
            if (res !== undefined) {
                debug(`remapped ${logicalId}`);
                return res;
            }
        }

        const awsMapping = mapToAwsResource(logicalId, typeName, props, options);
        if (awsMapping !== undefined) {
            debug(`mapped ${logicalId} to classic AWS resource(s)`);
            return awsMapping;
        }

        const cfnMapping = mapToCfnResource(logicalId, typeName, props, options);
        debug(`mapped ${logicalId} to native AWS resource(s)`);
        return cfnMapping;
    }

    private processOptions(resource: CloudFormationResource, parent: pulumi.Resource): pulumi.ResourceOptions {
        const dependsOn = getDependsOn(resource);
        return {
            parent: parent,
            dependsOn: dependsOn !== undefined ? dependsOn.map((id) => this.resources.get(id)!.resource) : undefined,
        };
    }

    /** @internal */
    asOutputValue<T>(v: T): T {
        const value = this.stackComponent.stack.resolve(v);
        return this.processIntrinsics(value) as T;
    }

    private processIntrinsics(obj: any): any {
        try {
            debug(`Processing intrinsics for ${JSON.stringify(obj)}`);
        } catch {
            // just don't log
        }
        if (typeof obj === 'string') {
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
                debug(`Fn::GetAtt(${params[0]}, ${params[1]})`);
                return this.resolveAtt(params[0], params[1]);
            }

            case 'Fn::Join':
                return lift(([delim, strings]) => strings.join(delim), this.processIntrinsics(params));

            case 'Fn::Select':
                return lift(([index, list]) => list[index], this.processIntrinsics(params));

            case 'Fn::Split':
                return lift(([delim, str]) => str.split(delim), this.processIntrinsics(params));

            case 'Fn::Base64':
                return lift((str) => Buffer.from(str).toString('base64'), this.processIntrinsics(params));

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

                    const parts: string[] = [];
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
                return getAccountId({ parent: this.stackComponent }).then((r) => r.accountId);
            case 'AWS::NoValue':
                return undefined;
            case 'AWS::Partition':
                return getPartition({ parent: this.stackComponent }).then((p) => p.partition);
            case 'AWS::Region':
                return getRegion({ parent: this.stackComponent }).then((r) => r.region);
            case 'AWS::URLSuffix':
                return getUrlSuffix({ parent: this.stackComponent }).then((r) => r.urlSuffix);
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
