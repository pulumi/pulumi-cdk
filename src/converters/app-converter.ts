import * as cdk from 'aws-cdk-lib/core';
import * as aws from '@pulumi/aws-native';
import * as pulumi from '@pulumi/pulumi';
import { AssemblyManifestReader, StackAddress, StackManifest } from '../assembly';
import { ConstructInfo, Graph, GraphBuilder, GraphNode } from '../graph';
import { ArtifactConverter } from './artifact-converter';
import { lift, Mapping, AppComponent, CdkAdapterError } from '../types';
import {
    CdkConstruct,
    NestedStackConstruct,
    ResourceAttributeMapping,
    ResourceMapping,
    resourcesFromResourceMapping,
} from '../interop';
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
import { CloudFormationResource, CloudFormationTemplate, getDependsOn } from '../cfn';
import { OutputMap, OutputRepr } from '../output-map';
import { parseSub } from '../sub';
import { getPartition } from '@pulumi/aws-native/getPartition';
import { mapToCustomResource } from '../custom-resource-mapping';
import * as intrinsics from './intrinsics';
import { CloudFormationParameter, CloudFormationParameterWithId } from '../cfn';
import { Metadata, PulumiResource } from '../pulumi-metadata';
import { PulumiProvider } from '../types';
import { parseDynamicValue } from './dynamic-references';
import { StackMap } from '../stack-map';
import { NestedStackParameter } from './intrinsics';

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
            throw new CdkAdapterError(`missing CDK Stack for artifact ${artifact.id}`);
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
    readonly parameters = new StackMap<any>();
    readonly resources = new StackMap<Mapping<pulumi.Resource>>();
    readonly constructs = new Map<ConstructInfo, pulumi.Resource>();
    readonly nestedStackParameters = new StackMap<NestedStackParameter>();
    readonly nestedStackNodes = new StackMap<GraphNode>();
    private readonly cdkStack: cdk.Stack;
    private readonly stackOptions?: pulumi.ComponentResourceOptions;

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
        this.stackOptions = host.stackOptions[stack.id];
        this.graph = GraphBuilder.build(this.stack);
        this.graph.nestedStackNodes.forEach(
            (node) => node.resourceAddress && this.nestedStackNodes.set(node.resourceAddress, node),
        );
    }

    public convert(dependencies: Set<ArtifactConverter>) {
        // process parameters first because resources will reference them
        Object.entries(this.stack.stacks).forEach(([stackPath, stack]) => {
            for (const [logicalId, value] of Object.entries(stack.Parameters ?? {})) {
                this.mapParameter({ stackPath, id: logicalId }, value.Type, value.Default);
            }
        });

        for (const n of this.graph.nodes) {
            if (n.construct.id === this.stack.id) {
                this._stackResource = new CdkConstruct(`${this.app.name}/${n.construct.path}`, n.construct.id, {
                    ...this.stackOptions,
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
            if (this.graph.nestedStackNodes.has(n.construct.path)) {
                const nestedStack = this.stack.stacks[n.construct.path];
                if (!nestedStack) {
                    throw new Error(`Could not find nested stack template for path ${n.construct.path}`);
                }

                // this is a nested stack, we create a special construct for it to handle outputs
                const r = new NestedStackConstruct(`${this.app.name}/${n.construct.path}`, {
                    parent,
                });

                this.registerResource(r, n);
            } else if (n.resource && n.resourceAddress) {
                const cfn = n.resource;
                debug(`Processing node with template: ${JSON.stringify(cfn)}`);
                debug(`Creating resource ${n.resourceAddress.id} in stack ${n.resourceAddress.stackPath}`);
                const props = this.processIntrinsics(cfn.Properties, n.resourceAddress.stackPath);
                const options = this.processOptions(n.resourceAddress, cfn, parent);

                const mapped = this.mapResource(n.resourceAddress, cfn.Type, props, options);
                this.registerResource(mapped, n);

                debug(`Done creating resource ${n.resourceAddress.id} in stack ${n.resourceAddress.stackPath}`);
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
        const resourceAddress = node.resourceAddress;
        // This should always be set because we only call this function when it is, but
        // TypeScript doesn't know that.
        if (!cfn || !resourceAddress) {
            throw new Error('Cannot map a resource without a CloudFormation resource');
        }

        const mainResource: ResourceAttributeMapping | undefined = Array.isArray(mapped)
            ? mapped.find((res) => res.logicalId === resourceAddress.id)
            : pulumi.Resource.isInstance(mapped)
            ? { resource: mapped }
            : mapped;
        if (!mainResource) {
            throw new CdkAdapterError(
                `Resource mapping for ${resourceAddress.id} of type ${cfn.Type} did not return a primary resource. \n` +
                    'Examine your code in "remapCloudControlResource"',
            );
        }
        const otherResources: pulumi.Resource[] | undefined = Array.isArray(mapped)
            ? mapped
                  .filter((map) => map.logicalId !== resourceAddress.id)
                  .flatMap((m) => {
                      this.resources.set(resourceAddress, {
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
        this.resources.set(resourceAddress, resourceMapping);
    }

    private stackDependsOn(dependencies: Set<ArtifactConverter>): pulumi.Resource[] {
        const dependsOn: pulumi.Resource[] = [];
        for (const d of dependencies) {
            if (d instanceof StackConverter) {
                dependsOn.push(d.stackResource);
            }
        }
        return dependsOn;
    }

    private mapParameter(stackAddress: StackAddress, typeName: string, defaultValue: any | undefined) {
        if (!this.stack.isRootStack(stackAddress.stackPath)) {
            // This is a nested stack. We need to look up the "AWS::CloudFormation::Stack" from the parent stack and then find the
            // parameter in `Properties.Parameters` of the "AWS::CloudFormation::Stack" resource.
            // This parameter cannot be resolved immediately because the nested stack resource is not created yet.
            // Instead we'll store the parameter in `nestedStackParameters` and resolve it later on demand.

            const nestedStackNode = this.graph.nestedStackNodes.get(stackAddress.stackPath);
            if (!nestedStackNode) {
                throw new CdkAdapterError(`Could not find nested stack node for ${stackAddress.stackPath}`);
            }

            const nestedStackResource = nestedStackNode.resource;
            const nestedStackAddress = nestedStackNode.resourceAddress;
            if (!nestedStackResource || !nestedStackAddress) {
                throw new CdkAdapterError(`Could not find nested stack resource for ${stackAddress.stackPath}`);
            }

            // if the parameter is set by the parent stack, we can use it directly. Otherwise, we fall through
            // and handle it like any other parameter
            const nestedStackParameter = nestedStackResource.Properties?.Parameters?.[stackAddress.id];
            if (nestedStackParameter) {
                this.nestedStackParameters.set(stackAddress, {
                    expression: nestedStackParameter,
                    stackPath: nestedStackAddress.stackPath,
                });
                return;
            }
        }

        if (!typeName.startsWith('AWS::SSM::Parameter::')) {
            throw new CdkAdapterError(
                `unsupported parameter ${stackAddress.id} of type ${typeName} in stack ${stackAddress.stackPath}`,
            );
        }
        if (defaultValue === undefined) {
            throw new CdkAdapterError(
                `unsupported parameter ${stackAddress.id} with no default value in stack ${stackAddress.stackPath}`,
            );
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

        this.parameters.set(stackAddress, parameterValue(this.app.component));
    }

    private mapResource(
        resourceAddress: StackAddress,
        typeName: string,
        props: any,
        options: pulumi.ResourceOptions,
    ): ResourceMapping {
        if (this.app.appOptions?.remapCloudControlResource !== undefined) {
            const res = this.app.appOptions.remapCloudControlResource(resourceAddress.id, typeName, props, options);
            if (res !== undefined) {
                resourcesFromResourceMapping(res).forEach((r) =>
                    debug(`[CDK Adapter] remapped type ${typeName} with logicalId ${resourceAddress.id}`, r),
                );
                return res;
            }
        }

        const awsMapping = mapToAwsResource(resourceAddress.id, typeName, props, options);
        if (awsMapping !== undefined) {
            resourcesFromResourceMapping(awsMapping).forEach((r) =>
                debug(
                    `[CDK Adapter] mapped type ${typeName} with logicalId ${resourceAddress.id} to AWS Provider resource`,
                    r,
                ),
            );
            return awsMapping;
        }

        const customResourceMapping = mapToCustomResource(resourceAddress.id, typeName, props, options, this.cdkStack);
        if (customResourceMapping !== undefined) {
            resourcesFromResourceMapping(customResourceMapping).forEach((r) =>
                debug(
                    `[CDK Adapter] mapped type ${typeName} with logicalId ${resourceAddress.id} to Custom resource`,
                    r,
                ),
            );
            return customResourceMapping;
        }

        const cfnMapping = mapToCfnResource(resourceAddress.id, typeName, props, options);
        resourcesFromResourceMapping(cfnMapping).forEach((r) =>
            debug(`[CDK Adapter] mapped type ${typeName} with logicalId ${resourceAddress.id} to CCAPI resource`, r),
        );
        return cfnMapping;
    }

    private getStackTemplate(stackPath: string): CloudFormationTemplate {
        const stack = this.stack.stacks[stackPath];
        if (!stack) {
            throw new Error(`Could not find stack template for ${stackPath}`);
        }
        return stack;
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
    private getRetainOnDelete(stackAddress: StackAddress, resource: CloudFormationResource): boolean | undefined {
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
                warn(
                    `DeletionPolicy Snapshot is not supported. Resource '${stackAddress.id}' in stack '${stackAddress.stackPath}' will be retained.`,
                );
                return true;
        }
    }

    private processOptions(
        stackAddress: StackAddress,
        resource: CloudFormationResource,
        parent: pulumi.Resource,
    ): pulumi.ResourceOptions {
        const dependsOn = getDependsOn(resource);
        const retainOnDelete = this.getRetainOnDelete(stackAddress, resource);
        return {
            parent: parent,
            retainOnDelete,
            dependsOn: dependsOn?.flatMap((id) => {
                const resource = this.resources.get({
                    id,
                    stackPath: stackAddress.stackPath,
                });
                if (resource === undefined) {
                    throw new Error(
                        `Something went wrong, resource with logicalId '${id}' not found in stack '${stackAddress.stackPath}'`,
                    );
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
        try {
            return this.processIntrinsics(value, this.stack.constructTree.path) as T;
        } catch (e) {
            // If value is not found in the current stack, try the other stacks
            let foundValue = null;
            let foundStack = null;

            for (const [stackPath, _] of this.graph.nestedStackNodes) {
                if (stackPath === this.stack.constructTree.path) continue;

                let result;
                try {
                    result = this.processIntrinsics(value, stackPath);
                } catch {
                    // Continue searching other stacks
                    continue;
                }
                if (!result) {
                    continue;
                }
                if (foundValue !== null) {
                    throw new CdkAdapterError(
                        `Value found in multiple stacks: ${foundStack} and ${stackPath}. Pulumi cannot resolve this value.`,
                    );
                }
                foundValue = result;
                foundStack = stackPath;
            }

            if (foundValue !== null) {
                return foundValue as T;
            }

            throw e; // Re-throw original error if not found in any stack
        }
    }

    public processIntrinsics(obj: any, stackPath: string): any {
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
            return obj.filter((x) => !this.isNoValue(x)).map((x) => this.processIntrinsics(x, stackPath));
        }

        const ref = obj.Ref;
        if (ref) {
            return intrinsics.ref.evaluate(this, [ref], stackPath);
        }

        const keys = Object.keys(obj);
        if (keys.length == 1 && keys[0]?.startsWith('Fn::')) {
            return this.resolveIntrinsic(keys[0], obj[keys[0]], stackPath);
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
                let value = this.processIntrinsics(v, stackPath);
                value = parseDynamicValue(this.stackResource, value);
                return {
                    ...result,
                    [k]: value,
                };
            }, {});
    }

    private isNoValue(obj: any): boolean {
        return obj?.Ref === 'AWS::NoValue';
    }

    /**
     * @internal
     */
    public resolveOutput(repr: OutputRepr): pulumi.Output<any> {
        const result = OutputMap.instance().lookupOutput(repr);
        if (result === undefined) {
            throw new Error(`@pulumi/pulumi-cdk internal failure: unable to resolveOutput ${repr.PulumiOutput}`);
        }
        return result;
    }

    private resolveIntrinsic(fn: string, params: any, stackPath: string) {
        switch (fn) {
            case 'Fn::GetAtt': {
                const logicalId = params[0];
                const attributeName = params[1];
                debug(`Fn::GetAtt(${logicalId}, ${attributeName})`);
                // Special case for VPC Ipv6CidrBlocks
                // Ipv6 cidr blocks are added to the VPC through a separate VpcCidrBlock resource
                // Due to [pulumi/pulumi-aws-native#1798] the `Ipv6CidrBlocks` attribute will always be empty
                // and we need to instead pull the `Ipv6CidrBlock` attribute from the VpcCidrBlock resource.
                const vpcNodeAddress = this.graph.vpcNodes.get({ stackPath, id: logicalId })?.vpcCidrBlockNode
                    ?.resourceAddress;
                if (attributeName === 'Ipv6CidrBlocks' && vpcNodeAddress) {
                    return [this.resolveAtt(vpcNodeAddress, 'Ipv6CidrBlock')];
                }

                return this.resolveAtt({ id: params[0], stackPath }, params[1]);
            }

            case 'Fn::Join':
                return lift(([delim, strings]) => strings.join(delim), this.processIntrinsics(params, stackPath));

            case 'Fn::Select':
                return lift(([index, list]) => list[index], this.processIntrinsics(params, stackPath));

            case 'Fn::Split':
                return lift(([delim, str]) => str.split(delim), this.processIntrinsics(params, stackPath));

            case 'Fn::Base64':
                return lift((str) => Buffer.from(str).toString('base64'), this.processIntrinsics(params, stackPath));

            case 'Fn::Cidr': {
                return lift(
                    ([ipBlock, count, cidrBits]) =>
                        cidr({
                            ipBlock,
                            count: parseInt(count, 10),
                            cidrBits: parseInt(cidrBits, 10),
                        }).then((r) => r.subnets),
                    this.processIntrinsics(params, stackPath),
                );
            }
            case 'Fn::GetAZs':
                return lift(
                    ([region]) => getAzs({ region }).then((r) => r.azs),
                    this.processIntrinsics(params, stackPath),
                );

            case 'Fn::Sub':
                return lift((params) => {
                    const [template, _vars] =
                        typeof params === 'string' ? [params, undefined] : [params[0] as string, params[1]];

                    // parts may contain pulumi.Output values.
                    const parts: any[] = [];
                    for (const part of parseSub(template)) {
                        parts.push(part.str);

                        if (part.ref !== undefined) {
                            if (part.ref.attr !== undefined) {
                                parts.push(this.resolveAtt({ id: part.ref.id, stackPath }, part.ref.attr!));
                            } else {
                                parts.push(intrinsics.ref.evaluate(this, [part.ref.id], stackPath));
                            }
                        }
                    }

                    return lift((parts) => parts.map((v: any) => v.toString()).join(''), parts);
                }, this.processIntrinsics(params, stackPath));

            case 'Fn::Transform': {
                // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/template-macros.html
                throw new CdkAdapterError('Fn::Transform is not supported – Cfn Template Macros are not supported yet');
            }

            case 'Fn::ImportValue': {
                // TODO: support cross cfn stack references?
                // This is related to the Export Name from outputs https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html
                // We might revisit this once the CDKTF supports cross stack references
                throw new CdkAdapterError(`Fn::ImportValue is not yet supported.`);
            }

            case 'Fn::FindInMap': {
                return lift(([mappingLogicalName, topLevelKey, secondLevelKey]) => {
                    if (params.length !== 3) {
                        throw new CdkAdapterError(`Fn::FindInMap requires exactly 3 parameters, got ${params.length}`);
                    }
                    const stack = this.stack.stacks[stackPath];
                    if (!stack) {
                        throw new Error(`No stack found for ${stackPath}`);
                    }
                    if (!stack.Mappings) {
                        throw new Error(`No mappings found in stack`);
                    }
                    if (!(mappingLogicalName in stack.Mappings)) {
                        throw new Error(
                            `Mapping ${mappingLogicalName} not found in mappings of stack ${stackPath}. Available mappings are ${Object.keys(
                                stack.Mappings,
                            )}`,
                        );
                    }
                    const topLevelMapping = stack.Mappings[mappingLogicalName];
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
                }, this.processIntrinsics(params, stackPath));
            }

            case 'Fn::Equals': {
                return intrinsics.fnEquals.evaluate(this, params, stackPath);
            }

            case 'Fn::If': {
                return intrinsics.fnIf.evaluate(this, params, stackPath);
            }

            case 'Fn::Or': {
                return intrinsics.fnOr.evaluate(this, params, stackPath);
            }

            default:
                throw new CdkAdapterError(`unsupported intrinsic function ${fn} (params: ${JSON.stringify(params)})`);
        }
    }

    private lookup(stackAddress: StackAddress): Mapping<pulumi.Resource> | { value: any } {
        const targetParameter = this.parameters.get(stackAddress);
        if (targetParameter !== undefined) {
            return { value: targetParameter };
        }
        const targetMapping = this.resources.get(stackAddress);
        if (targetMapping !== undefined) {
            return targetMapping;
        }
        throw new Error(`missing reference for ${stackAddress.id} in stack ${stackAddress.stackPath}`);
    }

    private resolveAtt(resourceAddress: StackAddress, attribute: string) {
        const mapping = <Mapping<pulumi.Resource>>this.lookup(resourceAddress);

        debug(
            `Resource: ${resourceAddress.id} - stackPath: ${resourceAddress.stackPath} - resourceType: ${
                mapping.resourceType
            } - ${Object.getOwnPropertyNames(mapping.resource)}`,
        );

        // If this resource has explicit attribute mappings, those mappings will use PascalCase, not camelCase.
        const propertyName = mapping.attributes !== undefined ? attribute : attributePropertyName(attribute);

        if (NestedStackConstruct.isNestedStackConstruct(mapping.resource)) {
            const nestedStackNode = this.nestedStackNodes.get(resourceAddress);
            if (!nestedStackNode) {
                throw new Error(`Could not find nested stack node for path ${resourceAddress.stackPath}`);
            }

            const nestedStack = this.stack.stacks[nestedStackNode.construct.path];
            if (!nestedStack) {
                throw new Error(`Could not find nested stack template for path ${nestedStackNode.construct.path}`);
            }

            const outputName = attribute.replace(/^Outputs\./, '');
            if (nestedStack.Outputs?.[outputName]?.Value) {
                return this.processIntrinsics(nestedStack.Outputs[outputName].Value, nestedStackNode.construct.path);
            }

            throw new Error(`No output ${outputName} found in nested stack ${nestedStackNode.construct.path}`);
        }

        // CFN CustomResources have a `data` property that contains the attributes. It is part of the response
        // of the Lambda Function backing the Custom Resource.
        if (aws.cloudformation.CustomResourceEmulator.isInstance(mapping.resource)) {
            return mapping.resource.data.apply((attrs) => {
                const descs = Object.getOwnPropertyDescriptors(attrs);
                const d = descs[attribute];
                if (!d) {
                    throw new Error(
                        `No attribute ${attribute} on custom resource ${resourceAddress.id} in stack ${resourceAddress.stackPath}`,
                    );
                }
                return d.value;
            });
        }

        const descs = Object.getOwnPropertyDescriptors(mapping.attributes || mapping.resource);
        const d = descs[propertyName];
        if (!d) {
            throw new CdkAdapterError(
                `No property ${propertyName} for attribute ${attribute} on resource ${resourceAddress.id} in stack ${resourceAddress.stackPath}`,
            );
        }
        return d.value;
    }

    findCondition(stackAddress: StackAddress): intrinsics.Expression | undefined {
        const template = this.getStackTemplate(stackAddress.stackPath);
        if (stackAddress.id in (template.Conditions || {})) {
            return template.Conditions![stackAddress.id];
        } else {
            return undefined;
        }
    }

    evaluate(expression: intrinsics.Expression, stackPath: string): intrinsics.Result<any> {
        return this.processIntrinsics(expression, stackPath);
    }

    fail(msg: string): intrinsics.Result<any> {
        throw new Error(msg);
    }

    succeed<T>(r: T): intrinsics.Result<T> {
        return <any>r;
    }

    apply<T, U>(result: intrinsics.Result<T>, fn: (value: U) => intrinsics.Result<U>): intrinsics.Result<U> {
        return lift(fn, result);
    }

    findParameter(stackAddress: StackAddress): CloudFormationParameterWithId | undefined {
        const template = this.getStackTemplate(stackAddress.stackPath);
        const p: CloudFormationParameter | undefined = (template.Parameters || {})[stackAddress.id];
        return p ? { ...p, stackAddress } : undefined;
    }

    evaluateParameter(param: CloudFormationParameterWithId): intrinsics.Result<any> {
        const value = this.parameters.get(param.stackAddress);

        if (value === undefined) {
            // If the parameter is a nested stack parameter we need to resolve the expression from the nested stack resource.
            const nestedStackParam = this.nestedStackParameters.get(param.stackAddress);
            if (nestedStackParam !== undefined) {
                return this.evaluate(nestedStackParam.expression, nestedStackParam.stackPath);
            }

            throw new Error(
                `No value for the CloudFormation parameter "${param.stackAddress.id}" in stack "${param.stackAddress.stackPath}"`,
            );
        }

        return value;
    }

    findResourceMapping(stackAddress: StackAddress): Mapping<pulumi.Resource> | undefined {
        return this.resources.get(stackAddress);
    }

    tryFindResource(cfnType: string): PulumiResource | undefined {
        const m = new Metadata(PulumiProvider.AWS_NATIVE);
        return m.tryFindResource(cfnType);
    }

    getStackNodeId(): intrinsics.Result<string> {
        return this.cdkStack.node.id;
    }

    getAccountId(): intrinsics.Result<string> {
        return getAccountId({ parent: this.stackResource }).then((r) => r.accountId);
    }

    getRegion(): intrinsics.Result<string> {
        return getRegion({ parent: this.stackResource }).then((r) => r.region);
    }

    getPartition(): intrinsics.Result<string> {
        return getPartition({ parent: this.stackResource }).then((p) => p.partition);
    }

    getURLSuffix(): intrinsics.Result<string> {
        return getUrlSuffix({ parent: this.stackResource }).then((r) => r.urlSuffix);
    }
}
