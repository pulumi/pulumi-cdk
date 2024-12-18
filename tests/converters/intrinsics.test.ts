import * as ccapi from '@pulumi/aws-native';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as intrinsics from '../../src/converters/intrinsics';
import {
    CloudFormationParameter,
    CloudFormationParameterWithId,
} from '../../src/cfn';
import { Mapping } from '../../src/types';
import { PulumiResource } from '../../src/pulumi-metadata';
import { OutputRepr } from '../../src/output-map';
import { StackAddress } from '../../src/assembly';

describe('Fn::If', () => {
    test('picks true', async () => {
        const tc = new TestContext({ conditions: { 'test-stack': { MyCondition: true }} });
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no'], 'test-stack');
        expect(result).toEqual(ok('yes'));
    });

    test('picks false', async () => {
        const tc = new TestContext({ conditions: { 'test-stack': { MyCondition: false } } });
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no'], 'test-stack');
        expect(result).toEqual(ok('no'));
    });

    test('errors if condition is not found', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no'], 'test-stack');
        expect(result).toEqual(failed(`No condition 'MyCondition' found`));
    });

    test('errors if condition evaluates to a non-boolean', async () => {
        const tc = new TestContext({ conditions: { 'test-stack': { MyCondition: 'OOPS' } } });
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no'], 'test-stack');
        expect(result).toEqual(failed(`Expected a boolean, got string`));
    });

    test('picks condition from correct stack', async () => {
        const tc = new TestContext({ conditions: {
            'test-stack': { MyCondition: false } ,
            'nested-stack': { MyCondition: true }
        }});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no'], 'nested-stack');
        expect(result).toEqual(ok('yes'));
    });
});

describe('Fn::Or', () => {
    test('picks true', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [true, false, true], 'test-stack');
        expect(result).toEqual(ok(true));
    });

    test('picks false', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, false, false], 'test-stack');
        expect(result).toEqual(ok(false));
    });

    test('picks true from inner Condition', async () => {
        const tc = new TestContext({ conditions: { 'test-stack': { MyCondition: true } } });
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, { Condition: 'MyCondition' }], 'test-stack');
        expect(result).toEqual(ok(true));
    });

    test('picks false with inner Condition', async () => {
        const tc = new TestContext({ conditions: { 'test-stack': { MyCondition: false } } });
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, { Condition: 'MyCondition' }], 'test-stack');
        expect(result).toEqual(ok(false));
    });

    test('has to have at least two arguments', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false], 'test-stack');
        expect(result).toEqual(failed(`Fn::Or expects at least 2 params, got 1`));
    });

    test('short-cirtcuits evaluation if true is found', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [true, { Condition: 'DoesNotExist' }], 'test-stack');
        expect(result).toEqual(ok(true));
    });

    test('picks condition from correct stack', async () => {
        const tc = new TestContext({ conditions: {
            'test-stack': { MyCondition: false } ,
            'nested-stack': { MyCondition: true }
        }});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, { Condition: 'MyCondition' }], 'nested-stack');
        expect(result).toEqual(ok(true));
    });
});

describe('Fn::And', () => {
    test('picks true', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, true, true], 'test-stack');
        expect(result).toEqual(ok(true));
    });

    test('picks false', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, false, true], 'test-stack');
        expect(result).toEqual(ok(false));
    });

    test('picks true from inner Condition', async () => {
        const tc = new TestContext({ conditions: { 'test-stack': { MyCondition: true } } });
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, { Condition: 'MyCondition' }], 'test-stack');
        expect(result).toEqual(ok(true));
    });

    test('picks false with inner Condition', async () => {
        const tc = new TestContext({ conditions: { 'test-stack': { MyCondition: false } } });
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, { Condition: 'MyCondition' }], 'test-stack');
        expect(result).toEqual(ok(false));
    });

    test('has to have at least two arguments', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [false], 'test-stack');
        expect(result).toEqual(failed(`Fn::And expects at least 2 params, got 1`));
    });

    test('short-cirtcuits evaluation if false is found', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [false, { Condition: 'DoesNotExist' }], 'test-stack');
        expect(result).toEqual(ok(false));
    });

    test('picks condition from correct stack', async () => {
        const tc = new TestContext({ conditions: {
            'test-stack': { MyCondition: false } ,
            'nested-stack': { MyCondition: true }
        }});
        let result = runIntrinsic(intrinsics.fnAnd, tc, [false, { Condition: 'MyCondition' }], 'nested-stack');
        expect(result).toEqual(ok(false));
        result = runIntrinsic(intrinsics.fnAnd, tc, [true, { Condition: 'MyCondition' }], 'nested-stack');
        expect(result).toEqual(ok(true));
    });
});

describe('Fn::Not', () => {
    test('inverts false', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnNot, tc, [true], 'test-stack');
        expect(result).toEqual(ok(false));
    });

    test('inverts true', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnNot, tc, [false], 'test-stack');
        expect(result).toEqual(ok(true));
    });

    test('inverts a false Condition', async () => {
        const tc = new TestContext({ conditions: { 'test-stack': { MyCondition: false } } });
        const result = runIntrinsic(intrinsics.fnNot, tc, [{ Condition: 'MyCondition' }], 'test-stack');
        expect(result).toEqual(ok(true));
    });

    test('inverts a true Condition', async () => {
        const tc = new TestContext({ conditions: { 'test-stack': { MyCondition: true } } });
        const result = runIntrinsic(intrinsics.fnNot, tc, [{ Condition: 'MyCondition' }], 'test-stack');
        expect(result).toEqual(ok(false));
    });

    test('requires a boolean', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnNot, tc, ['ok'], 'test-stack');
        expect(result).toEqual(failed(`Expected a boolean, got string`));
    });

    test('picks condition from correct stack', async () => {
        const tc = new TestContext({ conditions: {
            'test-stack': { MyCondition: false } ,
            'nested-stack': { MyCondition: true }
        }});
        const result = runIntrinsic(intrinsics.fnNot, tc, [{ Condition: 'MyCondition' }], 'nested-stack');
        expect(result).toEqual(ok(false));
    });
});

describe('Fn::Equals', () => {
    test('detects equal strings', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, ['a', 'a'], 'test-stack');
        expect(result).toEqual(ok(true));
    });

    test('detects unequal strings', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, ['a', 'b'], 'test-stack');
        expect(result).toEqual(ok(false));
    });

    test('detects equal objects', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, [{ x: 'a' }, { x: 'a' }], 'test-stack');
        expect(result).toEqual(ok(true));
    });

    test('detects unequal objects', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, [{ x: 'a' }, { x: 'b' }], 'test-stack');
        expect(result).toEqual(ok(false));
    });

    test('insists on two arguments', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, [1], 'test-stack');
        expect(result).toEqual(failed(`Fn::Equals expects exactly 2 params, got 1`));
    });

    test('preserves stack path', async () => {
        const tc = new TestContext({ conditions: {
            'test-stack': { MyCondition: false } ,
            'nested-stack': { MyCondition: true }
        }});
        const result = runIntrinsic(intrinsics.fnEquals, tc, ['yes', { 'Fn::If': ['MyCondition', 'yes', 'no'] }], 'nested-stack');
        expect(result).toEqual(ok(true));
    });
});

describe('Ref', () => {
    test('resolves a parameter by its logical ID', async () => {
        const tc = new TestContext({
            parameters: {
                'test-stack': { MyParam: { id: 'MyParam', Type: 'String', Default: 'MyParamValue' } },
            },
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyParam'], 'test-stack');
        expect(result).toEqual(ok('MyParamValue'));
    });

    test('respects "id" resource mapping provided by the user', async () => {
        const tc = new TestContext({
            resources: {
                'test-stack': {
                    MyRes: {
                        resource: <any>{},
                        resourceType: 'AWS::S3::Bucket',
                        attributes: {
                            id: 'myID',
                        },
                    },
                },
            },
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes'], 'test-stack');
        expect(result).toEqual(ok('myID'));
    });

    test('resolves a CustomResource to its physical ID', async () => {
        const tc = new TestContext({
            resources: {
                'test-stack': {
                    MyRes: {
                        resource: <any>{
                            __pulumiType: (<any>ccapi.cloudformation.CustomResourceEmulator).__pulumiType,
                            physicalResourceId: 'physicalID',
                        },
                        resourceType: 'AWS::CloudFormation::CustomResource',
                    },
                },
            },
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes'], 'test-stack');
        expect(result).toEqual(ok('physicalID'));
    });

    test('fails if Pulumi metadata indicates Ref is not supported', async () => {
        const tc = new TestContext({
            resources: {
                'test-stack': {
                    MyRes: {
                        resource: <any>{
                            __pulumiType: (<any>ccapi.s3.Bucket).__pulumiType,
                        },
                        resourceType: 'AWS::S3::Bucket',
                    },
                },
            },
            pulumiMetadata: {
                'AWS::S3::Bucket': {
                    inputs: {},
                    outputs: {},
                    cfRef: {
                        notSupported: true,
                    },
                },
            },
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes'], 'test-stack');
        expect(result).toEqual(failed('Ref intrinsic is not supported for the AWS::S3::Bucket resource type'));
    });

    test('resolves to a property value indicated by Pulumi metadata', async () => {
        const tc = new TestContext({
            resources: {
                'test-stack': {
                    MyRes: {
                        resource: <any>{
                            stageName: 'my-stage',
                            __pulumiType: (<any>ccapi.apigateway.Stage).__pulumiType,
                        },
                        resourceType: 'AWS::ApiGateway::Stage',
                    },
                },
            },
            pulumiMetadata: {
                'AWS::ApiGateway::Stage': {
                    inputs: {},
                    outputs: {},
                    cfRef: {
                        property: 'StageName',
                    },
                },
            },
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes'], 'test-stack');
        expect(result).toEqual(ok('my-stage'));
    });

    test('does not use Pulumi metadata for AWS provider resource', async () => {
        const tc = new TestContext({
            resources: {
                'test-stack': {
                    MyRes: {
                        resource: <any>{
                            id: 'my-stage',
                            __pulumiType: (<any>aws.apigateway.Stage).__pulumiType,
                        },
                        resourceType: 'AWS::ApiGateway::Stage',
                    },
                },
            },
            pulumiMetadata: {
                'AWS::ApiGateway::Stage': {
                    inputs: {},
                    outputs: {},
                    cfRef: {
                        property: 'StageName',
                    },
                },
            },
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes'], 'test-stack');
        expect(result).toEqual(ok('my-stage'));
    });

    test('resolves to a join of several property values indicated by Pulumi metadata', async () => {
        const tc = new TestContext({
            resources: {
                'test-stack': {
                    MyRes: {
                        resource: <any>{
                            roleName: 'my-role',
                            policyName: 'my-policy',
                            __pulumiType: (<any>ccapi.iam.RolePolicy).__pulumiType,
                        },
                        resourceType: 'AWS::IAM::RolePolicy',
                    },
                },
            },
            pulumiMetadata: {
                'AWS::IAM::RolePolicy': {
                    inputs: {},
                    outputs: {},
                    cfRef: {
                        properties: ['PolicyName', 'RoleName'],
                        delimiter: '|',
                    },
                },
            },
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes'], 'test-stack');
        expect(result).toEqual(ok('my-policy|my-role'));
    });

    test('fails if called with an ID that does not resolve', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.ref, tc, ['MyParam'], 'test-stack');
        expect(result).toEqual(
            failed('Ref intrinsic unable to resolve MyParam in stack test-stack: not a known logical resource or parameter reference'),
        );
    });

    test('evaluates inner expressions before resolving', async () => {
        const tc = new TestContext({
            parameters: {
                'test-stack': { MyParam: { id: 'MyParam', Type: 'String', Default: 'MyParamValue' } },
            },
            conditions: {
                'test-stack': { MyCondition: true },
            },
        });
        const result = runIntrinsic(intrinsics.ref, tc, [{ 'Fn::If': ['MyCondition', 'MyParam', 'MyParam2'] }], 'test-stack');
        expect(result).toEqual(ok('MyParamValue'));
    });

    test('resolves pseudo-parameters', async () => {
        const stackNodeId = 'stackNodeId';
        const tc = new TestContext({
            parameters: {
                'test-stack': { MyParam: { id: 'MyParam', Type: 'String', Default: 'MyParamValue' } },
            },
            conditions: {
                'test-stack': { MyCondition: true },
            },
            accountId: '012345678901',
            region: 'us-west-2',
            partition: 'aws-us-gov',
            urlSuffix: 'amazonaws.com.cn',
            stackNodeId: stackNodeId,
        });

        expect(runIntrinsic(intrinsics.ref, tc, ['AWS::AccountId'], 'test-stack')).toEqual(ok('012345678901'));
        expect(runIntrinsic(intrinsics.ref, tc, ['AWS::Region'], 'test-stack')).toEqual(ok('us-west-2'));
        expect(runIntrinsic(intrinsics.ref, tc, ['AWS::Partition'], 'test-stack')).toEqual(ok('aws-us-gov'));
        expect(runIntrinsic(intrinsics.ref, tc, ['AWS::URLSuffix'], 'test-stack')).toEqual(ok('amazonaws.com.cn'));
        expect(runIntrinsic(intrinsics.ref, tc, ['AWS::NoValue'], 'test-stack')).toEqual(ok(undefined));

        expect(runIntrinsic(intrinsics.ref, tc, ['AWS::NotificationARNs'], 'test-stack')).toEqual(
            failed('AWS::NotificationARNs pseudo-parameter is not yet supported in pulumi-cdk'),
        );

        // These are approximations; testing the current behavior for completeness sake.
        expect(runIntrinsic(intrinsics.ref, tc, ['AWS::StackId'], 'test-stack')).toEqual(ok(stackNodeId));
        expect(runIntrinsic(intrinsics.ref, tc, ['AWS::StackName'], 'test-stack')).toEqual(ok(stackNodeId));
    });

    test('resolves resource in correct stack', async () => {
        const tc = new TestContext({
            resources: {
                'test-stack': {
                    MyRes: {
                        resource: <any>{
                            bucketName: "parent-bucket",
                            __pulumiType: (<any>ccapi.s3.Bucket).__pulumiType,
                        },
                        resourceType: 'AWS::S3::Bucket',
                    },
                },
                'nested-stack': {
                    MyRes: {
                        resource: <any>{
                            bucketName: "nested-bucket",
                            __pulumiType: (<any>ccapi.s3.Bucket).__pulumiType,
                        },
                        resourceType: 'AWS::S3::Bucket',
                    },
                },
            },
            pulumiMetadata: {
                'AWS::S3::Bucket': {
                    inputs: {},
                    outputs: {},
                    cfRef: {
                        properties: ['BucketName'],
                    },
                },
            },
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes'], 'nested-stack');
        expect(result).toEqual(ok('nested-bucket'));
    });
});

function runIntrinsic(fn: intrinsics.Intrinsic, tc: TestContext, args: intrinsics.Expression[], stackPath: string): TestResult<any> {
    const result: TestResult<any> = <any>fn.evaluate(tc, args, stackPath);
    return result;
}

type TestResult<T> = { ok: true; value: T } | { ok: false; errorMessage: string };

function ok<T>(result: T): TestResult<T> {
    return { ok: true, value: result };
}

function failed<T>(errorMessage: string): TestResult<T> {
    return { ok: false, errorMessage: errorMessage };
}

interface StackNode<T> {
    [stackPath: string]: { [id: string]: T };
}

class TestContext implements intrinsics.IntrinsicContext {
    accountId: string;
    region: string;
    partition: string;
    urlSuffix: string;
    stackNodeId: string;
    conditions: StackNode<intrinsics.Expression>;
    parameters: StackNode<CloudFormationParameter & { id: string }>;
    resources: StackNode<Mapping<pulumi.Resource>>;
    pulumiMetadata: { [cfnType: string]: PulumiResource };

    constructor(args: {
        accountId?: string;
        region?: string;
        partition?: string;
        urlSuffix?: string;
        stackNodeId?: string;
        conditions?: StackNode<intrinsics.Expression>;
        parameters?: StackNode<CloudFormationParameter & { id: string }>;
        resources?: StackNode<Mapping<pulumi.Resource>>;
        pulumiMetadata?: { [cfnType: string]: PulumiResource };
    }) {
        this.stackNodeId = args.stackNodeId || '';
        this.accountId = args.accountId || '';
        this.partition = args.partition || '';
        this.region = args.region || '';
        this.urlSuffix = args.urlSuffix || '';
        this.conditions = args.conditions || {};
        this.parameters = args.parameters || {};
        this.resources = args.resources || {};
        this.pulumiMetadata = args.pulumiMetadata || {};
    }

    resolveOutput(repr: OutputRepr): pulumi.Output<any> {
        throw new Error('Method not implemented.');
    }

    tryFindResource(cfnType: string): PulumiResource | undefined {
        if (cfnType in this.pulumiMetadata) {
            return this.pulumiMetadata[cfnType];
        }
    }

    findParameter(stackAddress: StackAddress): CloudFormationParameterWithId | undefined {
        const param = this.parameters?.[stackAddress.stackPath]?.[stackAddress.id];
        if (param) {
            return { ...param, stackAddress };
        }
    }

    evaluateParameter(param: CloudFormationParameter): intrinsics.Result<any> {
        // Simplistic but sufficient for this test suite.
        return this.succeed(param.Default!);
    }

    findCondition(stackAddress: StackAddress): intrinsics.Expression | undefined {
        return this.conditions?.[stackAddress.stackPath]?.[stackAddress.id];
    }

    findResourceMapping(stackAddress: StackAddress): Mapping<pulumi.Resource> | undefined {
        return this.resources?.[stackAddress.stackPath]?.[stackAddress.id];
    }

    evaluate(expression: intrinsics.Expression, stackPath: string): intrinsics.Result<any> {
        // Evaluate known heuristics.
        const known = [
            intrinsics.fnAnd,
            intrinsics.fnEquals,
            intrinsics.fnIf,
            intrinsics.fnNot,
            intrinsics.fnOr,
            intrinsics.ref,
        ];
        if (typeof expression === 'object' && Object.keys(expression).length == 1) {
            for (const k of known) {
                if (k.name === Object.keys(expression)[0]) {
                    const args = expression[k.name];
                    return k.evaluate(this, args, stackPath);
                }
            }
        }

        // Self-evaluate the expression. This is very incomplete.
        const result: TestResult<any> = { ok: true, value: expression };
        return result;
    }

    apply<T, U>(result: intrinsics.Result<T>, fn: (x: T) => intrinsics.Result<U>): intrinsics.Result<U> {
        const t: TestResult<T> = <any>result; // assume result is a TestResult
        if (t.ok) {
            return fn(t.value);
        } else {
            return { ok: false, errorMessage: t.errorMessage };
        }
    }

    fail(msg: string): intrinsics.Result<any> {
        const result: TestResult<any> = { ok: false, errorMessage: msg };
        return result;
    }

    succeed<T>(r: T): intrinsics.Result<T> {
        const result: TestResult<any> = { ok: true, value: r };
        return result;
    }

    getAccountId(): intrinsics.Result<string> {
        return this.succeed(this.accountId);
    }

    getRegion(): intrinsics.Result<string> {
        return this.succeed(this.region);
    }

    getPartition(): intrinsics.Result<string> {
        return this.succeed(this.partition);
    }

    getURLSuffix(): intrinsics.Result<string> {
        return this.succeed(this.urlSuffix);
    }

    getStackNodeId(): intrinsics.Result<string> {
        return this.succeed(this.stackNodeId);
    }
}
