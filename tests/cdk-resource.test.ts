import * as pulumi from '@pulumi/pulumi';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { TableArgs } from '@pulumi/aws-native/dynamodb';
import { Stack } from '../src/stack';
import { Construct } from 'constructs';
import { MockCallArgs, MockResourceArgs } from '@pulumi/pulumi/runtime';
import { Key } from 'aws-cdk-lib/aws-kms';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { aws_ssm } from 'aws-cdk-lib';

function setMocks(assertFn: (args: MockResourceArgs) => void) {
    pulumi.runtime.setMocks(
        {
            call: (_args: MockCallArgs) => {
                return {};
            },
            newResource: (args: MockResourceArgs): { id: string; state: any } => {
                switch (args.type) {
                    case 'cdk:index:Stack':
                        return { id: '', state: {} };
                    case 'cdk:construct:TestStack':
                        return { id: '', state: {} };
                    case 'cdk:index:Component':
                        return { id: '', state: {} };
                    default:
                        assertFn(args);
                        return {
                            id: args.name + '_id',
                            state: args.inputs,
                        };
                }
            },
        },
        'project',
        'stack',
        false,
    );
}

function testStack(fn: (scope: Construct) => void, done: any) {
    class TestStack extends Stack {
        constructor(id: string) {
            super(id, {
                props: {
                    env: {
                        region: 'us-east-1',
                        account: '12345678912',
                    },
                },
            });

            fn(this);

            this.synth();
        }
    }

    const s = new TestStack('teststack');
    s.urn.apply(() => done());
}

describe('CDK Construct tests', () => {
    // DynamoDB table was previously mapped to the `aws` provider
    // otherwise this level of testing wouldn't be necessary.
    // We also don't need to do this type of testing for _every_ resource
    test('dynamodb table', (done) => {
        setMocks((args) => {
            if (args.type === 'aws-native:dynamodb:Table') {
                expect(args.inputs).toEqual({
                    keySchema: [
                        { attributeName: 'pk', keyType: 'HASH' },
                        { attributeName: 'sort', keyType: 'RANGE' },
                    ],
                    sseSpecification: {
                        kmsMasterKeyId: 'arn:aws:kms:us-west-2:123456789012:key/abcdefg',
                        sseEnabled: true,
                        sseType: 'KMS',
                    },
                    attributeDefinitions: [
                        { attributeName: 'pk', attributeType: 'S' },
                        { attributeName: 'sort', attributeType: 'S' },
                        { attributeName: 'lsiSort', attributeType: 'S' },
                        { attributeName: 'gsiKey', attributeType: 'S' },
                    ],
                    provisionedThroughput: {
                        readCapacityUnits: 5,
                        writeCapacityUnits: 5,
                    },
                    globalSecondaryIndexes: [
                        {
                            provisionedThroughput: {
                                readCapacityUnits: 5,
                                writeCapacityUnits: 5,
                            },
                            indexName: 'gsi',
                            keySchema: [{ attributeName: 'gsiKey', keyType: 'HASH' }],
                            projection: {
                                projectionType: 'ALL',
                            },
                        },
                    ],
                    localSecondaryIndexes: [
                        {
                            projection: { projectionType: 'ALL' },
                            keySchema: [
                                { attributeName: 'pk', keyType: 'HASH' },
                                { attributeName: 'lsiSort', keyType: 'RANGE' },
                            ],
                            indexName: 'lsi',
                        },
                    ],
                } as TableArgs);
            }
        });
        testStack((scope) => {
            const key = Key.fromKeyArn(scope, 'key', 'arn:aws:kms:us-west-2:123456789012:key/abcdefg');
            const table = new dynamodb.Table(scope, 'Table', {
                encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
                encryptionKey: key,
                sortKey: {
                    name: 'sort',
                    type: dynamodb.AttributeType.STRING,
                },
                partitionKey: {
                    name: 'pk',
                    type: dynamodb.AttributeType.STRING,
                },
            });
            table.addLocalSecondaryIndex({
                indexName: 'lsi',
                sortKey: {
                    type: dynamodb.AttributeType.STRING,
                    name: 'lsiSort',
                },
            });
            table.addGlobalSecondaryIndex({
                indexName: 'gsi',
                partitionKey: {
                    name: 'gsiKey',
                    type: dynamodb.AttributeType.STRING,
                },
            });
        }, done);
    });

    test('LoadBalancer dnsName attribute does not throw', (done) => {
        setMocks((_args) => {});
        testStack((scope) => {
            const vpc = new Vpc(scope, 'vpc');
            const alb = new ApplicationLoadBalancer(scope, 'alb', {
                vpc,
            });

            new aws_ssm.StringParameter(scope, 'param', {
                // Referencing the `dnsName` attribute of the LoadBalancer resource.
                // This tests that the reference is correctly mapped, otherwise this test
                // throws an error
                stringValue: alb.loadBalancerDnsName,
            });
        }, done);
    });
});
