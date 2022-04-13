import * as cdk from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
import { CdkResource, normalize, firstToLower } from './interop';
import { Stack, CfnElement, Aspects, Token } from 'aws-cdk-lib';
import { Construct, ConstructOrder, Node, IConstruct } from 'constructs';
import { ecs, iam, apprunner, lambda } from '@pulumi/aws-native';
import { debug } from '@pulumi/pulumi/log';

export class CdkStackComponent extends pulumi.ComponentResource {
    outputs!: { [outputId: string]: pulumi.Output<any> };

    constructor(
        name: string,
        args: (scope: Construct, parent: CdkStackComponent) => cdk.Stack,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('aws-native:cdk:StackComponent', name, args, opts);
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
    ): { [key: string]: pulumi.CustomResource } {
        return {};
    }
}

export type Mapping<T extends pulumi.CustomResource> = {
    resource: T;
    resourceType: string;
};

class PulumiCDKBridge extends Construct {
    resources!: { [key: string]: Mapping<pulumi.CustomResource> };

    constructor(scope: Construct, id: string, private readonly host: AwsPulumiAdapter) {
        super(scope, id);
        this.resources = {};
    }

    convert() {
        for (const r of this.host.node.findAll(ConstructOrder.POSTORDER)) {
            if (CfnElement.isCfnElement(r)) {
                const cfn = this.host.resolve((r as any)._toCloudFormation()) as CloudFormationTemplate;
                for (const [logical, value] of Object.entries(cfn.Resources || {})) {
                    const typeName = value.Type;
                    debug(`Creating resource for ${logical}:\n${JSON.stringify(cfn)}`);
                    const props = this.processIntrinsics(value.Properties);
                    const normProps = normalize(props);
                    const res = this.host.remapCloudControlResource(logical, typeName, normProps);
                    if (Object.keys(res).length > 0) {
                        const m: { [key: string]: Mapping<pulumi.CustomResource> } = {};
                        for (const [k, r] of Object.entries(res) ?? []) {
                            m[k] = { resource: r, resourceType: typeName };
                        }
                        this.resources = { ...m, ...this.resources };
                        continue;
                    }
                    switch (typeName) {
                        case 'AWS::ECS::Cluster': {
                            debug('Creating ECS Cluster resource');
                            const c = new ecs.Cluster(logical, normProps, { parent: this.host.parent });
                            this.resources[logical] = { resource: c, resourceType: typeName };
                        } break;
                        case 'AWS::ECS::TaskDefinition': {
                            debug('Creating ECS task definition');
                            const t = new ecs.TaskDefinition(logical, normProps, { parent: this.host.parent });
                            this.resources[logical] = { resource: t, resourceType: typeName };
                        } break;
                        case 'AWS::AppRunner::Service': {
                            const s = new apprunner.Service(logical, normProps, { parent: this.host.parent });
                            this.resources[logical] = { resource: s, resourceType: typeName };
                        } break;
                        case 'AWS::Lambda::Function': {
                            debug(`lambda: ${JSON.stringify(normProps)}`);
                            debug(`Keys in function ${normProps['role'] != undefined}`);
                            const l = new lambda.Function(logical, normProps, { parent: this.host.parent });
                            this.resources[logical] = { resource: l, resourceType: typeName };
                        } break;
                        case 'AWS::IAM::Role': {
                            debug('Creating IAM Role');
                            // We need this because IAM Role's CFN json format has the following field in uppercase.
                            const morphed: any = {};
                            Object.entries(props).forEach(([k, v]) => {
                                if (k == 'AssumeRolePolicyDocument') {
                                    morphed[firstToLower(k)] = v;
                                } else {
                                    morphed[k] = v;
                                }
                            });
                            const r = new iam.Role(logical, morphed, { parent: this.host.parent });
                            this.resources[logical] = { resource: r, resourceType: typeName };
                        } break;
                        default: {
                            debug(`Creating fallthrough CdkResource for type: ${typeName} - ${logical}`);
                            const f = new CdkResource(logical, typeName, normProps, { parent: this.host.parent });
                            this.resources[logical] = { resource: f, resourceType: typeName };
                        }
                    }
                    debug(`Done creating resource for ${logical}`);
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

        const intrinsic = Object.keys(obj)[0];
        if (intrinsic?.startsWith('Fn::') && Object.keys(obj).length === 1) {
            return this.resolveIntrinsic(intrinsic, obj[intrinsic]);
        } else if (intrinsic?.startsWith('Fn:') && !intrinsic?.startsWith('Fn::')) {
            console.warn('Found possible intrinsic function starting with "Fn:" instead of "Fn::". Typo?');
        }

        const result: any = {};
        for (const [k, v] of Object.entries(obj)) {
            result[k] = this.processIntrinsics(v);
        }

        return result;
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

    private resolveRef(ref: string) {
        switch (ref) {
            case 'AWS::Partition':
                return 'aws'; // TODO support this through an invoke?
        }
        if (ref?.startsWith('AWS::')) {
            throw new Error(`don't support pseudo parameters ${ref}`);
        }
        throw new Error(`unsupported reference ${ref}`);
    }

    private lookup(
        logicalId: string,
        visited: Set<IConstruct>,
        startat: IConstruct = this.host,
    ): IConstruct | undefined {
        const c = startat.node.tryFindChild(logicalId);
        if (c) {
            return c;
        }

        visited.add(startat);

        for (const c of startat.node.children) {
            debug(`looking for ${logicalId}: path = ${c.node.path}`);
            if (visited.has(c)) {
                debug(`found ${c.node.path} already`);
                continue;
            }

            if (CfnElement.isCfnElement(c)) {
                const resolved = this.host.resolve((c as CfnElement).logicalId);
                if (resolved == logicalId) {
                    return c;
                }
                debug(`${this.host.resolve((c as CfnElement).logicalId)}`);
            }

            const ret = this.lookup(logicalId, visited, c);
            if (ret) {
                return ret;
            }
        }

        return undefined;
    }

    private resolveAtt(logicalId: string, attribute: string) {
        const child = this.lookup(logicalId, new Set<IConstruct>());
        debug(`resolving ref for ${logicalId}: ${child}`);
        if (!CfnElement.isCfnElement(child)) {
            throw new Error(
                `unable to resolve a "Ref" to a resource with the logical ID ${logicalId}: ${typeof child}`,
            );
        }

        const cfn = (child as CfnElement)._toCloudFormation() as CloudFormationTemplate;
        for (const [id, value] of Object.entries(cfn.Resources || {})) {
            const resolvedId = this.host.resolve(id);
            if (!value.Properties) {
                debug(`No value for id: ${resolvedId} provided. Will look in resource.`);
                const res = this.resources[resolvedId];
                if (res) {
                    debug(
                        `Resource: ${resolvedId} - resourceType: ${res.resourceType} - ${Object.getOwnPropertyNames(
                            res.resource,
                        )}`,
                    );
                    const descs = Object.getOwnPropertyDescriptors(res.resource);
                    const d = descs[attribute];
                    if (!d) {
                        throw new Error(`No attribute ${attribute} found for resource ${logicalId}`);
                    }
                    return d.value;
                    // throw new Error(`Type of ${attribute} in resource ${logicalId} is ${typeof d.value}`)
                } else {
                    throw new Error(`No resource found for ${resolvedId} - current resources: ${this.resources.keys}`);
                }
                continue;
            }
            const att = value.Properties[attribute];
            if (!att) {
                throw new Error(`no "${attribute}" attribute mapping for resource ${logicalId}`);
            }
        }

        debug(`resolveAtt for ${logicalId}`);
        throw new Error(`no "${attribute}" attribute mapping for resource ${logicalId}`);
    }
}

export interface CloudFormationResource {
    readonly Type: string;
    readonly Properties: any;
    readonly Condition?: string;
}

export interface CloudFormationTemplate {
    Resources?: { [id: string]: CloudFormationResource };
    Conditions?: { [id: string]: any };
    Outputs?: { [id: string]: any };
}
