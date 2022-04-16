import * as cdk from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
import { ecs, iam, apprunner, lambda } from '@pulumi/aws-native';
import { debug } from '@pulumi/pulumi/log';
import { Stack, CfnElement, Aspects, Token, Reference, Tokenization } from 'aws-cdk-lib';
import { Construct, ConstructOrder, Node, IConstruct } from 'constructs';
import { CloudFormationResource, CloudFormationTemplate, getDependsOn } from './cfn';
import { GraphBuilder } from './graph';
import { CdkResource, normalize, firstToLower } from './interop';
import { OutputRepr, OutputMap } from './output-map';

export class CdkStackComponent extends pulumi.ComponentResource {
    outputs!: { [outputId: string]: pulumi.Output<any> };

    constructor(
        name: string,
        args: (scope: Construct, parent: CdkStackComponent) => cdk.Stack,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('cdk:index:StackComponent', name, args, opts);
        this.outputs = {};
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
    readonly resources = new Map<string, Mapping<pulumi.Resource>>();

    constructor(scope: Construct, id: string, private readonly host: AwsPulumiAdapter) {
        super(scope, id);
    }

    convert() {
        const dependencyGraphNodes = GraphBuilder.build(this.host);
        for (const n of dependencyGraphNodes) {
            if (CfnElement.isCfnElement(n.construct)) {
                const cfn = n.template!;
                for (const [logicalId, value] of Object.entries(cfn.Resources || {})) {
                    debug(`Creating resource for ${logicalId}:\n${JSON.stringify(cfn)}`);
                    const props = this.processIntrinsics(value.Properties);
                    const options = this.processOptions(value);
                    const mapped = this.mapResource(n.construct, logicalId, value.Type, props, options);
                    for (const [mappedId, resource] of Object.entries(mapped)) {
                        debug(`mapping ${mappedId} -> ${logicalId}`);
                        this.resources.set(mappedId, { resource, resourceType: value.Type });
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
            }
        }
    }

    private mapResource(
        element: CfnElement,
        logicalId: string,
        typeName: string,
        props: any,
        options: pulumi.ResourceOptions,
    ): { [logicalId: string]: pulumi.Resource } {
        const normProps = normalize(props);

        const res = this.host.remapCloudControlResource(logicalId, typeName, normProps, options);
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

                return { [logicalId]: new CdkResource(logicalId, typeName, normProps, attributes, options) };
            }
        }
    }

    private processOptions(resource: CloudFormationResource): pulumi.ResourceOptions {
        const dependsOn = getDependsOn(resource);
        return {
            parent: this.host.parent,
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

            case 'Fn::Join': {
                const [delim, strings] = params;
                const joined = (this.processIntrinsics(strings) as Array<string>).join(this.processIntrinsics(delim));
                debug(`Fn::Join result: ${joined}`);
                return joined;
            }

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
            case 'AWS::Partition':
                return 'aws'; // TODO support this through an invoke?
        }
        if (target?.startsWith('AWS::')) {
            throw new Error(`reference to unsupported pseudo parameter ${target}`);
        }

        const mapping = this.lookup(target);
        return (<pulumi.CustomResource>mapping.resource).id;
    }

    private lookup(logicalId: string): Mapping<pulumi.Resource> {
        const targetMapping = this.resources.get(logicalId);
        if (targetMapping === undefined) {
            throw new Error(`missing reference for ${logicalId}`);
        }
        return targetMapping;
    }

    private attributePropertyName(attributeName: string): string {
        return firstToLower(attributeName.split('.')[0]);
    }

    private resolveAtt(logicalId: string, attribute: string) {
        const mapping = this.lookup(logicalId);

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
}
