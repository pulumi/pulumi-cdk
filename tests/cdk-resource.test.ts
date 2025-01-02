import * as path from 'path';
import { NestedStack } from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { TableArgs } from '@pulumi/aws-native/dynamodb';
import { Key } from 'aws-cdk-lib/aws-kms';
import { setMocks, testApp } from './mocks';
import { MockResourceArgs } from '@pulumi/pulumi/runtime';
import { Construct } from 'constructs';

describe('CDK Construct tests', () => {
    let resources: MockResourceArgs[] = [];
    beforeAll(() => {
        process.env.AWS_REGION = 'us-east-2';
        resources = [];
        setMocks(resources);
    });
    afterAll(() => {
        process.env.AWS_REGION = undefined;
    });
    // DynamoDB table was previously mapped to the `aws` provider
    // otherwise this level of testing wouldn't be necessary.
    // We also don't need to do this type of testing for _every_ resource
    test('dynamodb table', async () => {
        await testApp((scope: Construct) => {
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
        });
        const db = resources.find((res) => res.type === 'aws-native:dynamodb:Table');
        expect(db).toBeDefined();
        expect(db!.inputs).toEqual({
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
    });

    test('route53 long text records are split', async () => {
        await testApp((scope: Construct) => {
            const zone = new route53.PublicHostedZone(scope, 'HostedZone', {
                zoneName: 'pulumi-cdk.com',
            });
            new route53.TxtRecord(scope, 'TxtRecord2', {
                zone,
                values: ['hello'.repeat(52)],
                recordName: 'cdk-txt-2',
            });
        });
        const txt = resources.find((res) => res.type === 'aws:route53/record:Record');
        expect(txt).toBeDefined();
        expect(txt?.inputs.records).toEqual(['hello'.repeat(51), 'hello']);
    });

    test('EventBusPolicy correctly maps statement', async () => {
        await testApp((scope: Construct) => {
            const eventBus = new events.EventBus(scope, 'testbus');
            eventBus.addToResourcePolicy(
                new iam.PolicyStatement({
                    sid: 'testsid',
                    actions: ['events:PutEvents'],
                    principals: [new iam.AccountRootPrincipal()],
                    resources: [eventBus.eventBusArn],
                }),
            );
        });
        const policy = resources.find((res) => res.type === 'aws:cloudwatch/eventBusPolicy:EventBusPolicy');
        expect(policy).toBeDefined();
        expect(policy?.inputs.policy).toEqual(
            JSON.stringify({
                Statement: [
                    {
                        Action: 'events:PutEvents',
                        Effect: 'Allow',
                        Principal: { AWS: 'arn:aws:iam::12345678910:root' },
                        Resource: 'testbus_arn',
                        Sid: 'cdk-testsid',
                    },
                ],
                Version: '2012-10-17',
            }),
        );
    });

    test('EventBusPolicy correctly maps props', async () => {
        await testApp((scope: Construct) => {
            // This type of event bus policy is created for cross account access
            new events.CfnEventBusPolicy(scope, 'buspolicy', {
                action: 'events:PutEvents',
                statementId: 'statement-id',
                principal: '123456789012',
            });
        });
        const policy = resources.find(
            (res) => res.type === 'aws:cloudwatch/eventBusPolicy:EventBusPolicy' && res.name === 'buspolicy',
        );
        expect(policy).toBeDefined();
        expect(policy?.inputs.policy).toEqual(
            JSON.stringify({
                Statement: [
                    {
                        Sid: 'statement-id',
                        Principal: { AWS: '123456789012' },
                        Action: 'events:PutEvents',
                        Effect: 'Allow',
                        Resource: 'arn:aws:events:us-east-2:123456789012:event-bus/default',
                    },
                ],
                Version: '2012-10-17',
            }),
        );
    });

    test('task definition references image ref', async () => {
        await testApp((scope: Construct) => {
            const taskDef = new ecs.FargateTaskDefinition(scope, 'Task');
            taskDef.addContainer('app', {
                image: ecs.ContainerImage.fromAsset(path.join(__dirname, 'test-data', 'app'), {
                    assetName: 'testapp',
                }),
            });
        });
        const task = resources.find((res) => res.type === 'aws-native:ecs:TaskDefinition');
        const image = resources.find((res) => res.type === 'docker-build:index:Image');
        expect(image).toBeDefined();
        expect(task).toBeDefined();
        expect(task?.inputs).toMatchObject({
            containerDefinitions: expect.arrayContaining([
                expect.objectContaining({
                    image: expect.stringMatching(
                        /^12345678910.dkr.ecr.us-east-1.amazonaws.com\/project-stack\/testapp:[a-z0-9]+@sha256:abcdefghijk1023$/,
                    ),
                }),
            ]),
        });
    });

    test('nested stack', async () => {
        await testApp((scope: Construct) => {
            const nestedStack = new NestedStack(scope, 'Nesty');
            const bucket = new s3.Bucket(nestedStack, 'bucket');
        });
        const nested = resources.find((res) => res.type === 'aws-native:s3:Bucket');
        expect(nested).toBeDefined();
    });

    test('nested stack with relative outdir', async () => {
        await testApp(
            (scope: Construct) => {
                const nestedStack = new NestedStack(scope, 'Nesty');
                const bucket = new s3.Bucket(nestedStack, 'bucket');
            },
            {
                appOptions: {
                    props: {
                        outdir: 'cdk.out',
                    },
                },
            },
        );
        const nested = resources.find((res) => res.type === 'aws-native:s3:Bucket');
        expect(nested).toBeDefined();
    });
});

describe('logicalId tests', () => {
    let resources: MockResourceArgs[] = [];
    beforeEach(() => {
        process.env.AWS_REGION = 'us-east-2';
        resources = [];
        setMocks(resources);
    });
    afterAll(() => {
        process.env.AWS_REGION = undefined;
    });
    test('logicalId is generated without hash for resources', async () => {
        await testApp((scope: Construct) => {
            new dynamodb.Table(scope, 'Table', {
                partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            });
        });
        const table = resources.find((res) => res.type === 'aws-native:dynamodb:Table');
        expect(table).toBeDefined();
        expect(table!.name).toEqual('Table');
    });

    test('logicalId with nested constructs', async () => {
        await testApp((scope: Construct) => {
            const construct = new Construct(scope, 'MyConstruct');
            new dynamodb.Table(construct, 'Table', {
                partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            });
        });
        const table = resources.find((res) => res.type === 'aws-native:dynamodb:Table');
        expect(table).toBeDefined();
        expect(table!.name).toEqual('MyConstructTable');
    });

    test('logicalId with nested constructs dedupped', async () => {
        await testApp((scope: Construct) => {
            const construct = new Construct(scope, 'MyConstruct');
            const construct2 = new Construct(construct, 'MyConstruct');
            new dynamodb.Table(construct2, 'Table', {
                partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            });
        });
        const table = resources.find((res) => res.type === 'aws-native:dynamodb:Table');
        expect(table).toBeDefined();
        expect(table!.name).toEqual('MyConstructTable');
    });

    test('logicalId with Resource', async () => {
        await testApp((scope: Construct) => {
            const construct = new Construct(scope, 'Resource');
            new dynamodb.Table(construct, 'Table', {
                partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            });
        });
        const table = resources.find((res) => res.type === 'aws-native:dynamodb:Table');
        expect(table).toBeDefined();
        expect(table!.name).toEqual('Table');
    });

    test('logicalId with Default', async () => {
        await testApp((scope: Construct) => {
            const construct = new Construct(scope, 'Default');
            new dynamodb.Table(construct, 'Table', {
                partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            });
        });
        const table = resources.find((res) => res.type === 'aws-native:dynamodb:Table');
        expect(table).toBeDefined();
        expect(table!.name).toEqual('Table');
    });

    test('logicalId with non-alphanumeric', async () => {
        await testApp((scope: Construct) => {
            const construct = new Construct(scope, 'MyConstruct-123');
            new dynamodb.Table(construct, 'Table', {
                partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
            });
        });
        const table = resources.find((res) => res.type === 'aws-native:dynamodb:Table');
        expect(table).toBeDefined();
        expect(table!.name).toEqual('MyConstruct123Table');
    });
});
