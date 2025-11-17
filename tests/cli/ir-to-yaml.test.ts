import { ProgramIR, ResourceAttributeReference } from '@pulumi/cdk-convert-core';
import { serializeProgramIr } from '../../src/cli/ir-to-yaml';
import { parse } from 'yaml';

describe('serializeProgramIr', () => {
    test('serializes resources, options, and parameter defaults', () => {
        const topicRef: ResourceAttributeReference = {
            kind: 'resourceAttribute',
            attributeName: 'Arn',
            propertyName: 'arn',
            resource: {
                id: 'Topic',
                stackPath: 'App/Main',
            },
        };

        const program: ProgramIR = {
            stacks: [
                {
                    stackId: 'AppStack',
                    stackPath: 'App/Main',
                    resources: [
                        {
                            logicalId: 'Topic',
                            cfnType: 'AWS::SNS::Topic',
                            cfnProperties: {},
                            typeToken: 'aws-native:sns:Topic',
                            props: {},
                        },
                        {
                            logicalId: 'Bucket',
                            cfnType: 'AWS::S3::Bucket',
                            cfnProperties: {
                                BucketName: 'data-bucket',
                                NotificationArn: topicRef,
                                Tags: [
                                    {
                                        Key: 'Env',
                                        Value: {
                                            kind: 'parameter',
                                            stackPath: 'App/Main',
                                            parameterName: 'Stage',
                                        },
                                    },
                                ],
                            },
                            typeToken: 'aws-native:s3:Bucket',
                            props: {
                                bucketName: 'data-bucket',
                                notificationArn: topicRef,
                                tags: [
                                    {
                                        key: 'Env',
                                        value: {
                                            kind: 'parameter',
                                            stackPath: 'App/Main',
                                            parameterName: 'Stage',
                                        },
                                    },
                                ],
                            },
                            options: {
                                dependsOn: [
                                    {
                                        id: 'Topic',
                                        stackPath: 'App/Main',
                                    },
                                ],
                                retainOnDelete: true,
                            },
                        },
                    ],
                    parameters: [
                        {
                            name: 'Stage',
                            type: 'String',
                            default: {
                                nested: 'value',
                            },
                        },
                    ],
                },
            ],
        };

        const parsed = parse(serializeProgramIr(program));

        expect(parsed.name).toBe('cdk-converted');
        expect(parsed.runtime).toBe('yaml');

        const bucket = parsed.resources['bucket'];
        expect(bucket).toMatchObject({
            type: 'aws-native:s3:Bucket',
            properties: {
                bucketName: 'data-bucket',
                notificationArn: '${Topic.arn}',
                tags: [
                    {
                        key: 'Env',
                        value: {
                            nested: 'value',
                        },
                    },
                ],
            },
            options: {
                dependsOn: ['${Topic}'],
                protect: true,
            },
        });

        const topic = parsed.resources['Topic'];
        expect(topic).toEqual({
            type: 'aws-native:sns:Topic',
        });
    });

    test('uses logical IDs as emitted resource names', () => {
        const program: ProgramIR = {
            stacks: [
                {
                    stackId: 'One',
                    stackPath: 'App-Res',
                    resources: [
                        {
                            logicalId: 'FooBar',
                            cfnType: 'AWS::SNS::Topic',
                            cfnProperties: {},
                            typeToken: 'aws-native:sns:Topic',
                            props: {},
                        },
                    ],
                },
                {
                    stackId: 'Two',
                    stackPath: 'App_Res',
                    resources: [
                        {
                            logicalId: 'Baz_Qux-Topic',
                            cfnType: 'AWS::SQS::Queue',
                            cfnProperties: {},
                            typeToken: 'aws-native:sqs:Queue',
                            props: {},
                        },
                    ],
                },
            ],
        };

        const parsed = parse(serializeProgramIr(program));
        expect(Object.keys(parsed.resources)).toEqual(['FooBar', 'Baz_Qux-Topic']);
    });

    test('lowercases logical IDs for resources that require it', () => {
        const program: ProgramIR = {
            stacks: [
                {
                    stackId: 'AppStack',
                    stackPath: 'App/Main',
                    resources: [
                        {
                            logicalId: 'MyBucket',
                            cfnType: 'AWS::S3::Bucket',
                            cfnProperties: {},
                            typeToken: 'aws-native:s3:Bucket',
                            props: {},
                        },
                    ],
                },
            ],
        };

        const parsed = parse(serializeProgramIr(program));
        expect(parsed.resources.MyBucket).toBeUndefined();
        expect(parsed.resources['mybucket']).toEqual({ type: 'aws-native:s3:Bucket' });
    });

    test('inlines stack output references across stacks', () => {
        const program: ProgramIR = {
            stacks: [
                {
                    stackId: 'Producer',
                    stackPath: 'Stacks/Producer',
                    resources: [
                        {
                            logicalId: 'Bucket',
                            cfnType: 'AWS::S3::Bucket',
                            cfnProperties: {},
                            typeToken: 'aws-native:s3:Bucket',
                            props: {},
                        },
                    ],
                    outputs: [
                        {
                            name: 'BucketArn',
                            value: {
                                kind: 'resourceAttribute',
                                attributeName: 'Arn',
                                propertyName: 'arn',
                                resource: {
                                    id: 'Bucket',
                                    stackPath: 'Stacks/Producer',
                                },
                            },
                        },
                    ],
                },
                {
                    stackId: 'Consumer',
                    stackPath: 'Stacks/Consumer',
                    resources: [
                        {
                            logicalId: 'Topic',
                            cfnType: 'AWS::SNS::Topic',
                            cfnProperties: {
                                SourceArn: {
                                    kind: 'stackOutput',
                                    stackPath: 'Stacks/Producer',
                                    outputName: 'BucketArn',
                                },
                            },
                            typeToken: 'aws-native:sns:Topic',
                            props: {
                                sourceArn: {
                                    kind: 'stackOutput',
                                    stackPath: 'Stacks/Producer',
                                    outputName: 'BucketArn',
                                },
                            },
                        },
                    ],
                },
            ],
        };

        const parsed = parse(serializeProgramIr(program));
        expect(parsed.resources['Topic'].properties.sourceArn).toBe('${bucket.arn}');
    });

    test('escapes interpolation markers inside literal strings', () => {
        const program: ProgramIR = {
            stacks: [
                {
                    stackId: 'AppStack',
                    stackPath: 'App/Stack',
                    resources: [
                        {
                            logicalId: 'Function',
                            cfnType: 'AWS::Lambda::Function',
                            cfnProperties: {
                                Code: 'console.log(${JSON.stringify("test")});',
                            },
                            typeToken: 'aws-native:lambda:Function',
                            props: {
                                code: 'console.log(${JSON.stringify("test")});',
                            },
                        },
                    ],
                },
            ],
        };

        const yaml = serializeProgramIr(program);
        expect(yaml).toContain('console.log($${JSON.stringify("test")});');
    });
});
