import * as aws from '@pulumi/aws-native';
import * as pulumi from '@pulumi/pulumi';
import * as intrinsics from '../../src/converters/intrinsics';
import { CloudFormationParameter } from '../../src/cfn';
import { Mapping } from '../../src/types';
import { PulumiResource } from '../../src/pulumi-metadata';


describe('Fn::If', () => {
    test('picks true', async () => {
        const tc = new TestContext({conditions: {'MyCondition': true}});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(ok('yes'));
    });

    test('picks false', async () => {
        const tc = new TestContext({conditions: {'MyCondition': false}});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(ok('no'));
    });

    test('errors if condition is not found', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(failed(`No condition 'MyCondition' found`));
    });

    test('errors if condition evaluates to a non-boolean', async () => {
        const tc = new TestContext({conditions: {'MyCondition': 'OOPS'}});
        const result = runIntrinsic(intrinsics.fnIf, tc, ['MyCondition', 'yes', 'no']);
        expect(result).toEqual(failed(`Expected a boolean, got string`));
    });
});

describe('Fn::Or', () => {
    test('picks true', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [true, false, true]);
        expect(result).toEqual(ok(true));
    });

    test('picks false', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, false, false]);
        expect(result).toEqual(ok(false));
    });

    test('picks true from inner Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': true}});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, {'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(true));
    });

    test('picks false with inner Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': false}});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false, {'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(false));
    });

    test('has to have at least two arguments', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [false]);
        expect(result).toEqual(failed(`Fn::Or expects at least 2 params, got 1`));
    });

    test('short-cirtcuits evaluation if true is found', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnOr, tc, [true, {'Condition': 'DoesNotExist'}]);
        expect(result).toEqual(ok(true));
    });
})

describe('Fn::And', () => {
    test('picks true', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, true, true]);
        expect(result).toEqual(ok(true));
    });

    test('picks false', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, false, true]);
        expect(result).toEqual(ok(false));
    });

    test('picks true from inner Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': true}});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, {'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(true));
    });

    test('picks false with inner Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': false}});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [true, {'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(false));
    });

    test('has to have at least two arguments', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [false]);
        expect(result).toEqual(failed(`Fn::And expects at least 2 params, got 1`));
    });

    test('short-cirtcuits evaluation if false is found', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnAnd, tc, [false, {'Condition': 'DoesNotExist'}]);
        expect(result).toEqual(ok(false));
    });
})


describe('Fn::Not', () => {
    test('inverts false', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnNot, tc, [true]);
        expect(result).toEqual(ok(false));
    });

    test('inverts true', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnNot, tc, [false]);
        expect(result).toEqual(ok(true));
    });

    test('inverts a false Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': false}});
        const result = runIntrinsic(intrinsics.fnNot, tc, [{'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(true));
    });

    test('inverts a true Condition', async () => {
        const tc = new TestContext({conditions: {'MyCondition': true}});
        const result = runIntrinsic(intrinsics.fnNot, tc, [{'Condition': 'MyCondition'}]);
        expect(result).toEqual(ok(false));
    });

    test('requires a boolean', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnNot, tc, ['ok']);
        expect(result).toEqual(failed(`Expected a boolean, got string`));
    });
})

describe('Fn::Equals', () => {
    test('detects equal strings', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, ['a', 'a']);
        expect(result).toEqual(ok(true));
    });

    test('detects unequal strings', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, ['a', 'b']);
        expect(result).toEqual(ok(false));
    });

    test('detects equal objects', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, [{x: 'a'}, {'x': 'a'}]);
        expect(result).toEqual(ok(true));
    });

    test('detects unequal objects', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, [{x: 'a'}, {'x': 'b'}]);
        expect(result).toEqual(ok(false));
    });

    test('insists on two arguments', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.fnEquals, tc, [1]);
        expect(result).toEqual(failed(`Fn::Equals expects exactly 2 params, got 1`));
    });
})

describe('Ref', () => {

    // resolves AWS::AccountID
    // resolves AWS:NotificationARNs
    // resolves AWS::NoValue
    // resolves AWS::Partition
    // resolves AWS::Region
    // resolves AWS::StackId
    // resolves AWS::StackName
    // resolves AWS::URLSuffix

    test('resolves a parameter by its logical ID', async () => {
        const tc = new TestContext({parameters: {
            'MyParam': {Type: 'String', Default: 'MyParamValue'}
        }});
        const result = runIntrinsic(intrinsics.ref, tc, ['MyParam']);
        expect(result).toEqual(ok('MyParamValue'));
    });

    test('respects "id" resource mapping provided by the user', async () => {
        const tc = new TestContext({resources: {
            'MyRes': {
                resource: <any>{},
                resourceType: 'AWS::S3::Bucket',
                attributes: {
                    'id': 'myID'
                },
            },
        }});
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes']);
        expect(result).toEqual(ok('myID'));
    });

    test('resolves a CustomResource to its physical ID', async () => {
        const tc = new TestContext({resources: {
            'MyRes': {
                resource: <any>{
                    __pulumiType: (<any>aws.cloudformation.CustomResourceEmulator).__pulumiType,
                    physicalResourceId: 'physicalID',
                },
                resourceType: 'AWS::CloudFormation::CustomResource',
            },
        }});
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes']);
        expect(result).toEqual(ok('physicalID'));
    });

    test('fails if Pulumi metadata indicates Ref is not supported', async () => {
        const tc = new TestContext({
            resources: {
                'MyRes': {
                    resource: <any>{},
                    resourceType: 'AWS::S3::Bucket',
                },
            },
            pulumiMetadata: {
                'AWS::S3::Bucket': {
                    inputs: {},
                    outputs: {},
                    cfRef: {
                        notSupported: true,
                    }
                },
            }
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes']);
        expect(result).toEqual(failed('Ref intrinsic is not supported for the AWS::S3::Bucket resource type'));
    });

    test('resolves to a property value indicated by Pulumi metadata', async () => {
        const tc = new TestContext({
            resources: {
                'MyRes': {
                    resource: <any>{stageName: 'my-stage'},
                    resourceType: 'AWS::ApiGateway::Stage',
                },
            },
            pulumiMetadata: {
                'AWS::ApiGateway::Stage': {
                    inputs: {},
                    outputs: {},
                    cfRef: {
                        property: 'StageName',
                    }
                },
            }
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes']);
        expect(result).toEqual(ok('my-stage'));
    });

    test('resolves to a join of several property values indicated by Pulumi metadata', async () => {
        const tc = new TestContext({
            resources: {
                'MyRes': {
                    resource: <any>{roleName: 'my-role', policyName: 'my-policy'},
                    resourceType: 'AWS::IAM::RolePolicy',
                },
            },
            pulumiMetadata: {
                'AWS::IAM::RolePolicy': {
                    inputs: {},
                    outputs: {},
                    cfRef: {
                        properties: ['PolicyName', 'RoleName'],
                        delimiter: '|',
                    }
                },
            }
        });
        const result = runIntrinsic(intrinsics.ref, tc, ['MyRes']);
        expect(result).toEqual(ok('my-policy|my-role'));
    });

    test('fails if called with an ID that does not resolve', async () => {
        const tc = new TestContext({});
        const result = runIntrinsic(intrinsics.ref, tc, ['MyParam']);
        expect(result).toEqual(failed('Ref intrinsic unable to resolve MyParam: not a known logical resource or parameter reference'));
    });
})

function runIntrinsic(fn: intrinsics.Intrinsic, tc: TestContext, args: intrinsics.Expression[]): TestResult<any> {
    const result: TestResult<any> = <any>(fn.evaluate(tc, args));
    return result;
};

type TestResult<T> =
    | {'ok': true, value: T}
    | {'ok': false, errorMessage: string};

function ok<T>(result: T): TestResult<T> {
    return {'ok': true, value: result};
}

function failed<T>(errorMessage: string): TestResult<T> {
    return {'ok': false, errorMessage: errorMessage};
}

class TestContext implements intrinsics.IntrinsicContext {
    conditions: { [id: string]: intrinsics.Expression };
    parameters: { [id: string]: CloudFormationParameter };
    resources: { [id: string]: Mapping<pulumi.Resource> };
    pulumiMetadata: { [cfnType: string]: PulumiResource };

    constructor(args: {
        conditions?: { [id: string]: intrinsics.Expression },
        parameters?: { [id: string]: CloudFormationParameter },
        resources?: { [id: string]: Mapping<pulumi.Resource> },
        pulumiMetadata?: { [cfnType: string]: PulumiResource },
    }) {
        this.conditions = args.conditions || {};
        this.parameters = args.parameters || {};
        this.resources = args.resources || {};
        this.pulumiMetadata = args.pulumiMetadata || {};
    }

    tryFindResource(cfnType: string): PulumiResource|undefined {
        if (this.pulumiMetadata.hasOwnProperty(cfnType)) {
            return this.pulumiMetadata[cfnType];
        }
    };

    findParameter(parameterLogicalID: string): CloudFormationParameter | undefined {
        if (this.parameters.hasOwnProperty(parameterLogicalID)) {
            return this.parameters[parameterLogicalID];
        }
    }

    evaluateParameter(param: CloudFormationParameter): intrinsics.Result<any> {
        // Simplistic but sufficient for this test suite.
        return this.succeed(param.Default!);
    }

    findCondition(conditionName: string): intrinsics.Expression|undefined {
        if (this.conditions.hasOwnProperty(conditionName)) {
            return this.conditions[conditionName];
        }
    }

    findResourceMapping(resourceLogicalID: string): Mapping<pulumi.Resource> | undefined {
        if (this.resources.hasOwnProperty(resourceLogicalID)) {
            return this.resources[resourceLogicalID];
        }
    }

    evaluate(expression: intrinsics.Expression): intrinsics.Result<any> {
        // Self-evaluate the expression. This is very incomplete.
        const result: TestResult<any> = {'ok': true, value: expression};
        return result;
    }

    apply<T, U>(result: intrinsics.Result<T>, fn: (x: T) => intrinsics.Result<U>): intrinsics.Result<U> {
        const t: TestResult<T> = <any>result; // assume result is a TestResult
        if (t.ok) {
            return fn(t.value);
        } else {
            return {'ok': false, errorMessage: t.errorMessage};
        }
    }

    fail(msg: string): intrinsics.Result<any> {
        const result: TestResult<any> = {'ok': false, errorMessage: msg};
        return result;
    }

    succeed<T>(r: T): intrinsics.Result<T> {
        const result: TestResult<any> = {'ok': true, value: r};
        return result;
    }
}
