import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { TableArgs } from '@pulumi/aws-native/dynamodb';
import { Stack } from '../src/stack';
import { Construct } from 'constructs';
import { Key } from 'aws-cdk-lib/aws-kms';
import { setMocks } from './mocks';

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
});
