import * as cdk from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
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
    getUrlSuffix,
} from '@pulumi/aws-native';
import { debug } from '@pulumi/pulumi/log';
import { Stack, CfnElement, Aspects, Token, Reference, Tokenization } from 'aws-cdk-lib';
import { Construct, ConstructOrder, Node, IConstruct } from 'constructs';
import { CloudFormationResource, CloudFormationTemplate, getDependsOn } from './cfn';
import { GraphBuilder } from './graph';
import { CfnResource, CdkConstruct, normalize, firstToLower } from './interop';
import { OutputRepr, OutputMap } from './output-map';

export class CdkStackComponent extends pulumi.ComponentResource {
    outputs!: { [outputId: string]: pulumi.Output<any> };

    name: string;

    constructor(
        name: string,
        args: (scope: Construct, parent: CdkStackComponent) => cdk.Stack,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('cdk:index:StackComponent', name, args, opts);
        this.outputs = {};
        this.name = name;
        const app = new cdk.App();
        const stack = args(app, this);
        app.synth();
        this.registerOutputs(this.outputs);
    }

    /** @internal */
    registerOutput(outputId: string, output: any) {
        this.outputs[outputId] = pulumi.output(output);
    }
}

export class AwsPulumiAdapter extends Stack {
    constructor(scope: Construct, id: string, readonly parent: CdkStackComponent) {
        super(undefined, id);

        const host = new PulumiCDKBridge(scope, id, this);

        Aspects.of(scope).add({
            visit: (node) => {
                if (node === scope) {
                    host.convert();
                }
            },
        });
    }

    public remapCloudControlResource(
        element: CfnElement,
        logicalId: string,
        typeName: string,
        props: any,
        options: pulumi.ResourceOptions,
    ): { [key: string]: pulumi.CustomResource } | undefined {
        return undefined;
    }
}

export type Mapping<T extends pulumi.Resource> = {
    resource: T;
    resourceType: string;
};

class PulumiCDKBridge extends Construct {
    readonly parameters = new Map<string, any>();
    readonly resources = new Map<string, Mapping<pulumi.Resource>>();
    readonly constructs = new Map<IConstruct, pulumi.Resource>();

    constructor(scope: Construct, id: string, private readonly host: AwsPulumiAdapter) {
        super(scope, id);
    }

    convert() {
        const dependencyGraphNodes = GraphBuilder.build(this.host);
        for (const n of dependencyGraphNodes) {
            const parent = Stack.isStack(n.construct.node.scope)
                ? this.host.parent
                : this.constructs.get(n.construct.node.scope!)!;

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
                    for (const [mappedId, resource] of Object.entries(mapped)) {
                        debug(`mapping ${mappedId} -> ${logicalId}`);
                        this.resources.set(mappedId, { resource, resourceType: value.Type });
                        this.constructs.set(n.construct, resource);
                    }
                    debug(`Done creating resource for ${logicalId}`);
                }
                for (const [conditionId, condition] of Object.entries(cfn.Conditions || {})) {
                    // Do something with the condition
                }
                // Register the outputs as outputs of the component resource.
                for (const [outputId, args] of Object.entries(cfn.Outputs || {})) {
                    this.host.parent.registerOutput(outputId, this.processIntrinsics(args.Value));
                }
            } else {
                const r = new CdkConstruct(`${this.host.parent.name}/${n.construct.node.path}`, n.construct, {
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

    private mapParameter(element: CfnElement, logicalId: string, typeName: string, defaultValue: any | undefined) {
        // TODO: support arbitrary parameters?

        if (!typeName.startsWith('AWS::SSM::Parameter::')) {
            throw new Error(`unsupported parameter ${logicalId} of type ${typeName}`);
        }
        if (defaultValue === undefined) {
            throw new Error(`unsupported parameter ${logicalId} with no default value`);
        }

        this.parameters.set(logicalId, defaultValue);
    }

    private mapResource(
        element: CfnElement,
        logicalId: string,
        typeName: string,
        props: any,
        options: pulumi.ResourceOptions,
    ): { [logicalId: string]: pulumi.Resource } {
        const normProps = normalize(props);

        const res = this.host.remapCloudControlResource(element, logicalId, typeName, normProps, options);
        if (res !== undefined) {
            debug(`remapped ${logicalId}`);
            return res;
        }

        switch (typeName) {
            case 'AWS::ECS::Cluster':
                return { [logicalId]: new ecs.Cluster(logicalId, normProps, options) };
            case 'AWS::ECS::TaskDefinition':
                return { [logicalId]: new ecs.TaskDefinition(logicalId, normProps, options) };
            case 'AWS::AppRunner::Service':
                return { [logicalId]: new apprunner.Service(logicalId, normProps, options) };
            case 'AWS::Lambda::Function':
                return { [logicalId]: new lambda.Function(logicalId, normProps, options) };
            case 'AWS::IAM::Role': {
                // We need this because IAM Role's CFN json format has the following field in uppercase.
                const morphed: any = {};
                Object.entries(props).forEach(([k, v]) => {
                    if (k == 'AssumeRolePolicyDocument') {
                        morphed[firstToLower(k)] = v;
                    } else {
                        morphed[k] = v;
                    }
                });
                return { [logicalId]: new iam.Role(logicalId, morphed, options) };
            }
            default: {
                // Scrape the attributes off of the construct.
                //
                // NOTE: this relies on CfnReference setting the reference's display name to the literal attribute name.
                const attributes = Object.values(element)
                    .filter(Token.isUnresolved)
                    .map((v) => Tokenization.reverse(v))
                    .filter(Reference.isReference)
                    .filter((ref) => ref.target === element)
                    .map((ref) => this.attributePropertyName(ref.displayName));

                return { [logicalId]: new CfnResource(logicalId, typeName, normProps, attributes, options) };
            }
        }
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
                return this.host.resolve(obj);
            }
            return obj;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map((x) => this.processIntrinsics(x));
        }

        const ref = obj.Ref;
        if (ref) {
            return this.resolveRef(ref);
        }

        const keys = Object.keys(obj);
        if (keys.length == 1 && keys[0]?.startsWith('Fn::')) {
            return this.resolveIntrinsic(keys[0], obj[keys[0]]);
        }

        const result: any = {};
        for (const [k, v] of Object.entries(obj)) {
            result[k] = this.processIntrinsics(v);
        }

        return result;
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
                return this.lift(([delim, strings]) => strings.join(delim), this.processIntrinsics(params));

            case 'Fn::Select':
                return this.lift(([index, list]) => list[index], this.processIntrinsics(params));

            case 'Fn::Split':
                return this.lift(([delim, str]) => str.split(delim), this.processIntrinsics(params));

            case 'Fn::Base64':
                return this.lift(([str]) => btoa(str), this.processIntrinsics(params));

            case 'Fn::Cidr':
                return this.lift(
                    ([ipBlock, count, cidrBits]) =>
                        cidr({
                            ipBlock,
                            count,
                            cidrBits,
                        }).then((r) => r.subnets),
                    this.processIntrinsics(params),
                );

            case 'Fn::GetAZs':
                return this.lift(([region]) => getAzs({ region }).then((r) => r.azs), this.processIntrinsics(params));

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
                return getAccountId({ parent: this.host.parent }).then((r) => r.accountId);
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
                return getRegion({ parent: this.host.parent }).then((r) => r.region);
            case 'AWS::URLSuffix':
                return getUrlSuffix({ parent: this.host.parent }).then((r) => r.urlSuffix);
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

    private attributePropertyName(attributeName: string): string {
        return firstToLower(attributeName.split('.')[0]);
    }

    private resolveAtt(logicalId: string, attribute: string) {
        const mapping = <Mapping<pulumi.Resource>>this.lookup(logicalId);

        debug(
            `Resource: ${logicalId} - resourceType: ${mapping.resourceType} - ${Object.getOwnPropertyNames(
                mapping.resource,
            )}`,
        );

        const propertyName = this.attributePropertyName(attribute);

        const descs = Object.getOwnPropertyDescriptors(mapping.resource);
        const d = descs[propertyName];
        if (!d) {
            throw new Error(`No property ${propertyName} for attribute ${attribute} on resource ${logicalId}`);
        }
        return d.value;
    }

    private containsEventuals(v: any): boolean {
        if (typeof v !== 'object') {
            return false;
        }

        if (v instanceof Promise || pulumi.Output.isInstance(v)) {
            return true;
        }

        if (Array.isArray(v)) {
            return v.some((e) => this.containsEventuals(e));
        }

        return Object.values(v).some((e) => this.containsEventuals(e));
    }

    private lift(f: (args: any) => any, args: any): any {
        if (!this.containsEventuals(args)) {
            return f(args);
        }
        return pulumi.all(args).apply(f);
    }
}
