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
                            typeToken: 'aws-native:sns:Topic',
                            props: {},
                        },
                        {
                            logicalId: 'Bucket',
                            typeToken: 'aws-native:s3:Bucket',
                            props: {
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

        const bucket = parsed.resources['app-main-bucket'];
        expect(bucket).toMatchObject({
            type: 'aws-native:s3:Bucket',
            properties: {
                BucketName: 'data-bucket',
                NotificationArn: '${app-main-topic.arn}',
                Tags: [
                    {
                        Key: 'Env',
                        Value: {
                            nested: 'value',
                        },
                    },
                ],
            },
            options: {
                dependsOn: ['app-main-topic'],
                protect: true,
            },
        });

        const topic = parsed.resources['app-main-topic'];
        expect(topic).toEqual({
            type: 'aws-native:sns:Topic',
        });
    });

    test('dedupes colliding resource names', () => {
        const program: ProgramIR = {
            stacks: [
                {
                    stackId: 'One',
                    stackPath: 'App-Res',
                    resources: [
                        {
                            logicalId: 'Foo',
                            typeToken: 'aws-native:s3:Bucket',
                            props: {},
                        },
                    ],
                },
                {
                    stackId: 'Two',
                    stackPath: 'App_Res',
                    resources: [
                        {
                            logicalId: 'Foo',
                            typeToken: 'aws-native:sqs:Queue',
                            props: {},
                        },
                    ],
                },
            ],
        };

        const parsed = parse(serializeProgramIr(program));
        expect(Object.keys(parsed.resources)).toEqual(['app-res-foo', 'app-res-foo-1']);
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
                            typeToken: 'aws-native:sns:Topic',
                            props: {
                                SourceArn: {
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
        expect(parsed.resources['stacks-consumer-topic'].properties.SourceArn).toBe(
            '${stacks-producer-bucket.arn}',
        );
    });
});
