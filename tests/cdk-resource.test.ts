import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { TableArgs } from '@pulumi/aws-native/dynamodb';
import { Key } from 'aws-cdk-lib/aws-kms';
import { setMocks, testStack } from './mocks';
import { MockResourceArgs } from '@pulumi/pulumi/runtime';
import { App, Stack } from '../src/stack';
import { Key } from 'aws-cdk-lib/aws-kms';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { aws_ssm } from 'aws-cdk-lib';
import { promiseOf, setMocks } from './mocks';

describe('CDK Construct tests', () => {
    // DynamoDB table was previously mapped to the `aws` provider
    // otherwise this level of testing wouldn't be necessary.
    // We also don't need to do this type of testing for _every_ resource
    test('dynamodb table', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources);

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
        const app = new App('testapp', (scope) => {
            const stack = new Stack(scope, 'teststack');
            const key = Key.fromKeyArn(stack, 'key', 'arn:aws:kms:us-west-2:123456789012:key/abcdefg');
            const table = new dynamodb.Table(stack, 'Table', {
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
        });
        const urn = await promiseOf(app.urn);
        expect(urn).toEqual('urn:pulumi:stack::project::cdk:index:App::testapp');
    });

    test('LoadBalancer dnsName attribute does not throw', async () => {
        setMocks((_args) => {});
        const app = new App('testapp', (scope) => {
            const stack = new Stack(scope, 'teststack');
            const vpc = new Vpc(stack, 'vpc');
            const alb = new ApplicationLoadBalancer(stack, 'alb', {
                vpc,
            });

            new aws_ssm.StringParameter(stack, 'param', {
                // Referencing the `dnsName` attribute of the LoadBalancer resource.
                // This tests that the reference is correctly mapped, otherwise this test
                // throws an error
                stringValue: alb.loadBalancerDnsName,
            });
        });
        const urn = await promiseOf(app.urn);
        expect(urn).toEqual('urn:pulumi:stack::project::cdk:index:App::testapp');
    });
});
