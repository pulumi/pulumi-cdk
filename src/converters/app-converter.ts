import * as cdk from 'aws-cdk-lib/core';
import * as aws from '@pulumi/aws-native';
import * as pulumi from '@pulumi/pulumi';
import { AssemblyManifestReader, StackManifest } from '../assembly';
import { ConstructInfo, Graph, GraphBuilder, GraphNode } from '../graph';
import { ArtifactConverter } from './artifact-converter';
import { lift, Mapping, AppComponent } from '../types';
import { CdkConstruct, ResourceAttributeMapping, ResourceMapping } from '../interop';
import { debug, warn } from '@pulumi/pulumi/log';
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
import { mapToCustomResource } from '../custom-resource-mapping';
import { processSecretsManagerReferenceValue } from './secrets-manager-dynamic';
import * as intrinsics from "./intrinsics";

/**
 * AppConverter will convert all CDK resources into Pulumi resources.
 */
export class AppConverter {
    // Map of stack artifactId to StackConverter
    public readonly stacks = new Map<string, StackConverter>();

    public readonly manifestReader: AssemblyManifestReader;

    constructor(readonly host: AppComponent) {
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
            if (!converter) {
                throw new Error(`Could not convert artifact with id ${d}`);
            }
            const c = this.convertStackManifest(converter.stack, done);
            if (c !== undefined) {
                debug(`${artifact.id} depends on ${d}`);
                dependencies.add(c);
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
export class StackConverter extends ArtifactConverter implements intrinsics.IntrinsicContext {
    readonly parameters = new Map<string, any>();
    readonly resources = new Map<string, Mapping<pulumi.Resource>>();
    readonly constructs = new Map<ConstructInfo, pulumi.Resource>();
    private readonly cdkStack: cdk.Stack;

    private _stackResource?: CdkConstruct;
    private readonly graph: Graph;

    public get stackResource(): CdkConstruct {
        if (!this._stackResource) {
            throw new Error('StackConverter has no stack resource');
        }
        return this._stackResource;
    }

    constructor(host: AppComponent, readonly stack: StackManifest) {
        super(host);
        this.cdkStack = host.stacks[stack.id];
        this.graph = GraphBuilder.build(this.stack);
    }

    public convert(dependencies: Set<ArtifactConverter>) {
        // process parameters first because resources will reference them
        for (const [logicalId, value] of Object.entries(this.stack.parameters ?? {})) {
            this.mapParameter(logicalId, value.Type, value.Default);
        }

        for (const n of this.graph.nodes) {
            if (n.construct.id === this.stack.id) {
                this._stackResource = new CdkConstruct(`${this.app.name}/${n.construct.path}`, n.construct.id, {
                    parent: this.app.component,
                    // NOTE: Currently we make the stack depend on all the assets and then all resources
                    // have the parent as the stack. This means we deploy all assets before we deploy any resources
                    // we might be able better and have individual resources depend on individual assets, but CDK
                    // doesn't track asset dependencies at that level
                    dependsOn: this.stackDependsOn(dependencies),
                });
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
                const options = this.processOptions(n.logicalId, cfn, parent);

                const mapped = this.mapResource(n.logicalId, cfn.Type, props, options);
                this.registerResource(mapped, n);

                debug(`Done creating resource for ${n.logicalId}`);
                // TODO: process template conditions
                // for (const [conditionId, condition] of Object.entries(cfn.Conditions || {})) {
                //     // Do something with the condition
                // }
            } else {
                const r = new CdkConstruct(`${this.app.name}/${n.construct.path}`, n.construct.type, {
                    parent,
                });
                this.constructs.set(n.construct, r);
            }
        }

        for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
            const n = this.graph.nodes[i];
            if (!n.resource) {
                (<CdkConstruct>this.constructs.get(n.construct)!).done();
            }
        }
    }

    /**
     * This function takes a Pulumi resource that was mapped from a CFN resource and
     * "registers" it to the StackConverter. The StackConverter keeps track of all of the
     * resources that were mapped from the CFN resources in the stack. It uses this information
     * to resolve references to other resources in the stack.
     *
     * Typically there will be a couple of scenarios for how a CFN resource maps to Pulumi resources:
     *
     * 1. The CFN resource maps to a single Pulumi aws-native resource
     *    This is the most straightforward case because everything maps directly, including the attributes
     *
     * 2. The CFN resource maps to single Pulumi aws resources
     *    In this case the mapping is to a single resource, but some times the attributes available
     *    on the CFN resource do not map to the attributes on the Pulumi resource. In these cases
     *    the mapping can return custom attributes that are later available when references are resolved
     *
     * 3. The CFN resource maps to multiple Pulumi aws resources
     *    One example would be the AWS::IAM::Policy resource which in CFN includes Role, Group, and User
     *    Polices, but in Pulumi aws these are broken out into separate resources. In that case the "main"
     *    resource would be the Policy and the other resources would be added to the resources array.
     *    The critical point here is that the "main" resource needs to have a logicalId that matches the
     *    logicalId of the CFN resource, while the other supporting resources must have different logicalIds.
     *
     * @param mapped - The Pulumi Resource that was mapped from the CFN resource
     * @param node - The GraphNode that represents the CFN Resource
     */
    private registerResource(mapped: ResourceMapping, node: GraphNode): void {
        const cfn = node.resource;
        // This should always be set because we only call this function when it is, but
        // TypeScript doesn't know that.
        if (!cfn) {
            throw new Error('Cannot map a resource without a CloudFormation resource');
        }
        const mainResource: ResourceAttributeMapping | undefined = Array.isArray(mapped)
            ? mapped.find((res) => res.logicalId === node.logicalId)
            : pulumi.Resource.isInstance(mapped)
            ? { resource: mapped }
            : mapped;
        if (!mainResource) {
            throw new Error(
                `Resource mapping for ${node.logicalId} of type ${cfn.Type} did not return a primary resource. \n` +
                    'Examine your code in "remapCloudControlResource"',
            );
        }
        const otherResources: pulumi.Resource[] | undefined = Array.isArray(mapped)
            ? mapped
                  .filter((map) => map.logicalId !== node.logicalId)
                  .flatMap((m) => {
                      this.resources.set(m.logicalId, {
                          resource: m.resource,
                          attributes: m.attributes,
                          resourceType: cfn.Type,
                      });
                      return m.resource;
                  })
            : undefined;
        const resourceMapping: Mapping<pulumi.Resource> = {
            resource: mainResource.resource,
            attributes: mainResource.attributes,
            resourceType: cfn.Type,
            otherResources,
        };
        this.constructs.set(node.construct, mainResource.resource);
        this.resources.set(node.logicalId!, resourceMapping);
    }

    private stackDependsOn(dependencies: Set<ArtifactConverter>): pulumi.Resource[] {
        const dependsOn: pulumi.Resource[] = [];
        dependsOn.push(...this.app.dependencies);
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

        this.parameters.set(logicalId, parameterValue(this.app.component));
    }

    private mapResource(
        logicalId: string,
        typeName: string,
        props: any,
        options: pulumi.ResourceOptions,
    ): ResourceMapping {
        if (this.app.appOptions?.remapCloudControlResource !== undefined) {
            const res = this.app.appOptions.remapCloudControlResource(logicalId, typeName, props, options);
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

        const customResourceMapping = mapToCustomResource(logicalId, typeName, props, options, this.cdkStack);
        if (customResourceMapping !== undefined) {
            debug(`mapped ${logicalId} to custom resource(s)`);
            return customResourceMapping;
        }

        const cfnMapping = mapToCfnResource(logicalId, typeName, props, options);
        debug(`mapped ${logicalId} to native AWS resource(s)`);
        return cfnMapping;
    }

    /**
     * Converts a CloudFormation deletion policy to a Pulumi retainOnDelete value.
     *
     * When a CloudFormation resource is set to Snapshot, CloudFormation will first
     * create a snapshot of the resource before deleting it. Pulumi does not have the same
     * capability, which means the user would need to manually create the snapshot before deleting.
     * to be on the safe side, we will retain the resource
     *
     * @param logicalId - The logicalId of the resource
     * @param resource - The CloudFormation resource
     * @returns - The retainOnDelete value
     */
    private getRetainOnDelete(logicalId: string, resource: CloudFormationResource): boolean | undefined {
        if (resource.DeletionPolicy === undefined) {
            return undefined;
        }
        switch (resource.DeletionPolicy) {
            case cdk.CfnDeletionPolicy.DELETE:
                return false;
            case cdk.CfnDeletionPolicy.RETAIN:
            case cdk.CfnDeletionPolicy.RETAIN_EXCEPT_ON_CREATE:
                // RETAIN_EXCEPT_ON_CREATE only applies to CloudFormation because CloudFormation will rollback a stack
                // if it fails to deploy. Pulumi does not have the same behavior, so we will treat it as RETAIN
                return true;
            case cdk.CfnDeletionPolicy.SNAPSHOT:
                warn(`DeletionPolicy Snapshot is not supported. Resource '${logicalId}' will be retained.`);
                return true;
        }
    }

    private processOptions(
        logicalId: string,
        resource: CloudFormationResource,
        parent: pulumi.Resource,
    ): pulumi.ResourceOptions {
        const dependsOn = getDependsOn(resource);
        const retainOnDelete = this.getRetainOnDelete(logicalId, resource);
        return {
            parent: parent,
            retainOnDelete,
            dependsOn: dependsOn?.flatMap((id) => {
                const resource = this.resources.get(id);
                if (resource === undefined) {
                    throw new Error(`Something went wrong, resource with logicalId '${id}' not found`);
                }
                if (resource.otherResources && resource.otherResources.length > 0) {
                    return resource.otherResources;
                }
                return resource!.resource;
            }),
        };
    }

    /** @internal */
    asOutputValue<T>(v: T): T {
        const value = this.cdkStack.resolve(v);
        return this.processIntrinsics(value) as T;
    }

    public processIntrinsics(obj: any): any {
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

        // This is where we can do any final processing on the resolved value
        // For example, if we have a value that contains intrinsics and refs, like:
        // "Fn::Join": [
        //    "",
        //    [
        //      "{{resolve:secretsmanager:",
        //      {
        //        "Ref": "somesecretlogicalId"
        //      },
        //      ":SecretString:password:AWSCURRENT}}"
        //    ]
        // ]
        //
        // Then we will recurse through that object resolving the ref and the join
        // and eventually get to the point where we have a string that looks like:
        // "{{resolve:secretsmanager:arn:aws:secretsmanager:us-east-2:12345678910:secret:somesecretid-abcd:SecretString:password:AWSCURRENT}}"
        return Object.entries(obj)
            .filter(([_, v]) => !this.isNoValue(v))
            .reduce((result, [k, v]) => {
                let value = this.processIntrinsics(v);
                value = processSecretsManagerReferenceValue(this.stackResource, value);
                return {
                    ...result,
                    [k]: value,
                };
            }, {});
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
                const logicalId = params[0];
                const attributeName = params[1];
                debug(`Fn::GetAtt(${logicalId}, ${attributeName})`);
                // Special case for VPC Ipv6CidrBlocks
                // Ipv6 cidr blocks are added to the VPC through a separate VpcCidrBlock resource
                // Due to [pulumi/pulumi-aws-native#1798] the `Ipv6CidrBlocks` attribute will always be empty
                // and we need to instead pull the `Ipv6CidrBlock` attribute from the VpcCidrBlock resource.
                if (
                    logicalId in this.graph.vpcNodes &&
                    attributeName === 'Ipv6CidrBlocks' &&
                    this.graph.vpcNodes[logicalId].vpcCidrBlockNode?.logicalId
                ) {
                    return [
                        this.resolveAtt(this.graph.vpcNodes[logicalId].vpcCidrBlockNode.logicalId, 'Ipv6CidrBlock'),
                    ];
                }

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

            case 'Fn::Cidr': {
                return lift(
                    ([ipBlock, count, cidrBits]) =>
                        cidr({
                            ipBlock,
                            count: parseInt(count, 10),
                            cidrBits: parseInt(cidrBits, 10),
                        }).then((r) => r.subnets),
                    this.processIntrinsics(params),
                );
            }
            case 'Fn::GetAZs':
                return lift(([region]) => getAzs({ region }).then((r) => r.azs), this.processIntrinsics(params));

            case 'Fn::Sub':
                return lift((params) => {
                    const [template, _vars] =
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

            case 'Fn::FindInMap': {
                return lift(([mappingLogicalName, topLevelKey, secondLevelKey]) => {
                    if (params.length !== 3) {
                        throw new Error(`Fn::FindInMap requires exactly 3 parameters, got ${params.length}`);
                    }
                    if (!this.stack.mappings) {
                        throw new Error(`No mappings found in stack`);
                    }
                    if (!(mappingLogicalName in this.stack.mappings)) {
                        throw new Error(
                            `Mapping ${mappingLogicalName} not found in mappings. Available mappings are ${Object.keys(
                                this.stack.mappings,
                            )}`,
                        );
                    }
                    const topLevelMapping = this.stack.mappings[mappingLogicalName];
                    if (!(topLevelKey in topLevelMapping)) {
                        throw new Error(
                            `Key ${topLevelKey} not found in mapping ${mappingLogicalName}. Available keys are ${Object.keys(
                                topLevelMapping,
                            )}`,
                        );
                    }
                    const secondLevelMapping = topLevelMapping[topLevelKey];
                    if (!(secondLevelKey in secondLevelMapping)) {
                        throw new Error(
                            `Key ${secondLevelKey} not found in mapping ${mappingLogicalName}.${topLevelKey}. Available keys are ${Object.keys(
                                secondLevelMapping,
                            )}`,
                        );
                    }

                    const value = secondLevelMapping[secondLevelKey];
                    return value;
                }, this.processIntrinsics(params));

            case 'Fn::Equals': {
                return intrinsics.fnEquals.evaluate(this, params);
            }

            case 'Fn::If': {
                return intrinsics.fnIf.evaluate(this, params);
            }

            case 'Fn::Or': {
                return intrinsics.fnOr.evaluate(this, params);
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
                return getAccountId({ parent: this.app.component }).then((r) => r.accountId);
            case 'AWS::NoValue':
                return undefined;
            case 'AWS::Partition':
                return getPartition({ parent: this.app.component }).then((p) => p.partition);
            case 'AWS::Region':
                return getRegion({ parent: this.app.component }).then((r) => r.region);
            case 'AWS::URLSuffix':
                return getUrlSuffix({ parent: this.app.component }).then((r) => r.urlSuffix);
            case 'AWS::NotificationARNs':
            case 'AWS::StackId':
            case 'AWS::StackName':
                // These are typically used in things like names or descriptions so I think
                // the stack node id is a good substitute.
                return this.cdkStack.node.id;
        }

        const mapping = this.lookup(target);
        if ((<any>mapping).value !== undefined) {
            return (<any>mapping).value;
        }
        // Due to https://github.com/pulumi/pulumi-cdk/issues/173 we have some
        // resource which we have to special case the `id` attribute. The `Resource.id`
        // will not contain the correct value
        const map = <Mapping<pulumi.Resource>>mapping;
        if (map.attributes && 'id' in map.attributes) {
            return map.attributes.id;
        } else if (aws.cloudformation.CustomResourceEmulator.isInstance(map.resource)) {
            // Custom resources have a `physicalResourceId` that is used for Ref
            return map.resource.physicalResourceId;
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

        // CFN CustomResources have a `data` property that contains the attributes. It is part of the response
        // of the Lambda Function backing the Custom Resource.
        if (aws.cloudformation.CustomResourceEmulator.isInstance(mapping.resource)) {
            return mapping.resource.data.apply((attrs) => {
                const descs = Object.getOwnPropertyDescriptors(attrs);
                const d = descs[attribute];
                if (!d) {
                    throw new Error(`No attribute ${attribute} on custom resource ${logicalId}`);
                }
                return d.value;
            });
        }

        const descs = Object.getOwnPropertyDescriptors(mapping.attributes || mapping.resource);
        const d = descs[propertyName];
        if (!d) {
            throw new Error(`No property ${propertyName} for attribute ${attribute} on resource ${logicalId}`);
        }
        return d.value;
    }

    findCondition(conditionName: string): intrinsics.Expression|undefined {
        if ((this.stack.conditions||{}).hasOwnProperty(conditionName)) {
            return this.stack.conditions![conditionName];
        } else {
            return undefined;
        }
    }

    evaluate(expression: intrinsics.Expression): intrinsics.Result<any> {
        return this.processIntrinsics(expression);
    }

    fail(msg: string): intrinsics.Result<any> {
        throw new Error(msg);
    }

    succeed<T>(r: T): intrinsics.Result<T> {
        return <any>r;
    }

    apply<T,U>(result: intrinsics.Result<T>, fn: (value: U) => intrinsics.Result<U>): intrinsics.Result<U> {
        return lift(fn, result);
    }
}
