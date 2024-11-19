import { normalize } from '../src/interop';
import * as pulumi from '@pulumi/pulumi';

beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
});
describe('normalize', () => {
    test('resource not in metadata', () => {
        // GIVEN
        jest.mock(
            '../schemas/aws-native-metadata.json',
            () => {
                return {
                    types: {},
                    resources: {},
                };
            },
            { virtual: true },
        );
        // WHEN
        const normalized = normalize(
            {
                SomeKey: {
                    NestedKey: 'someValue',
                },
            },
            'AWS::DummyService::DummyResource',
        );

        // THEN
        expect(normalized).toEqual({
            someKey: {
                nestedKey: 'someValue',
            },
        });
    });

    test('resource in metadata with json values', () => {
        // GIVEN
        jest.mock(
            '../schemas/aws-native-metadata.json',
            () => {
                return {
                    types: {
                        'aws-native:lambda:FunctionEnvironment': {
                            type: 'object',
                            properties: {
                                variables: {
                                    type: 'object',
                                    additionalProperties: {
                                        type: 'string',
                                    },
                                    description:
                                        'Environment variable key-value pairs. For more information, see [Using Lambda environment variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html).',
                                },
                            },
                        },
                    },
                    resources: {
                        'aws-native:lambda:Function': {
                            cf: 'AWS::Lambda::Function',
                            inputs: {
                                environment: {
                                    $ref: '#/types/aws-native:lambda:FunctionEnvironment',
                                    description:
                                        'Environment variables that are accessible from function code during execution.',
                                },
                            },
                        },
                        'aws-native:s3:Bucket': {
                            inputs: {
                                bucketName: {
                                    type: 'string',
                                },
                            },
                        },
                    },
                };
            },
            { virtual: true },
        );

        // WHEN
        const normalized = normalize(
            {
                Environment: {
                    Variables: {
                        Key: 'Value',
                    },
                },
            },
            'AWS::Lambda::Function',
        );

        // THEN
        expect(normalized).toEqual({
            environment: {
                variables: {
                    Key: 'Value',
                },
            },
        });
    });

    test('resource in metadata with additionalProperties values', () => {
        // GIVEN
        jest.mock(
            '../schemas/aws-native-metadata.json',
            () => {
                return {
                    types: {
                        'aws-native:apigateway:UsagePlanApiStage': {
                            type: 'object',
                            properties: {
                                apiId: {
                                    type: 'string',
                                    description: 'API Id of the associated API stage in a usage plan.',
                                },
                                stage: {
                                    type: 'string',
                                    description: 'API stage name of the associated API stage in a usage plan.',
                                },
                                throttle: {
                                    type: 'object',
                                    additionalProperties: {
                                        $ref: '#/types/aws-native:apigateway:UsagePlanThrottleSettings',
                                    },
                                    description:
                                        'Map containing method level throttling information for API stage in a usage plan.',
                                },
                            },
                        },
                        'aws-native:apigateway:UsagePlanThrottleSettings': {
                            type: 'object',
                            properties: {
                                burstLimit: {
                                    type: 'integer',
                                },
                                rateLimit: {
                                    type: 'number',
                                },
                            },
                        },
                    },
                    resources: {
                        'aws-native:apigateway:UsagePlan': {
                            cf: 'AWS::ApiGateway::UsagePlan',
                            inputs: {
                                apiStages: {
                                    type: 'array',
                                    items: {
                                        $ref: '#/types/aws-native:apigateway:UsagePlanApiStage',
                                    },
                                    description: 'The associated API stages of a usage plan.',
                                },
                            },
                        },
                    },
                };
            },
            { virtual: true },
        );
        // WHEN
        const normalized = normalize(
            {
                ApiStages: [
                    {
                        ApiId: 'api',
                        Stage: 'stage',
                        Throttle: {
                            // These keys should not be normalized, but their properties should
                            '/v1/toys/GET': {
                                BurstLimit: 2,
                                RateLimit: 10,
                            },
                        },
                    },
                ],
            },
            'AWS::ApiGateway::UsagePlan',
        );

        // THEN
        expect(normalized).toEqual({
            apiStages: [
                {
                    apiId: 'api',
                    stage: 'stage',
                    throttle: {
                        '/v1/toys/GET': {
                            burstLimit: 2,
                            rateLimit: 10,
                        },
                    },
                },
            ],
        });
    });

    test('resource in metadata with additionalProperties nested $ref values', () => {
        // GIVEN
        jest.mock(
            '../schemas/aws-native-metadata.json',
            () => {
                return {
                    types: {
                        'aws-native:amplifyuibuilder:ComponentBindingPropertiesValue': {
                            type: 'object',
                            properties: {
                                bindingProperties: {
                                    $ref: '#/types/aws-native:amplifyuibuilder:ComponentBindingPropertiesValueProperties',
                                    description: 'Describes the properties to customize with data at runtime.',
                                },
                                defaultValue: {
                                    type: 'string',
                                    description: 'The default value of the property.',
                                },
                                type: {
                                    type: 'string',
                                    description: 'The property type.',
                                },
                            },
                        },
                        'aws-native:amplifyuibuilder:ComponentBindingPropertiesValueProperties': {
                            type: 'object',
                            properties: {
                                bucket: {
                                    type: 'string',
                                    description: 'An Amazon S3 bucket.',
                                },
                            },
                        },
                    },
                    resources: {
                        'aws-native:amplifyuibuilder:Component': {
                            cf: 'AWS::AmplifyUIBuilder::Component',
                            inputs: {
                                bindingProperties: {
                                    type: 'object',
                                    additionalProperties: {
                                        $ref: '#/types/aws-native:amplifyuibuilder:ComponentBindingPropertiesValue',
                                    },
                                    description:
                                        "The information to connect a component's properties to data at runtime. You can't specify `tags` as a valid property for `bindingProperties` .",
                                },
                            },
                        },
                    },
                };
            },
            { virtual: true },
        );
        // WHEN
        const normalized = normalize(
            {
                BindingProperties: {
                    SomeProp: {
                        BindingProperties: {
                            Bucket: 'someBucket',
                        },
                        DefaultValue: 'someval',
                        Type: 'sometype',
                    },
                },
            },
            'AWS::AmplifyUIBuilder::Component',
        );

        // THEN
        expect(normalized).toEqual({
            bindingProperties: {
                SomeProp: {
                    bindingProperties: {
                        bucket: 'someBucket',
                    },
                    defaultValue: 'someval',
                    type: 'sometype',
                },
            },
        });
    });

    test('resource in metadata with additionalProperties nested json values', () => {
        // GIVEN
        jest.mock(
            '../schemas/aws-native-metadata.json',
            () => {
                return {
                    types: {
                        'aws-native:inspectorv2:CisScanConfigurationCisTargets': {
                            type: 'object',
                            properties: {
                                targetResourceTags: {
                                    type: 'object',
                                    additionalProperties: {
                                        $ref: 'pulumi.json#/Any',
                                    },
                                },
                            },
                        },
                    },
                    resources: {
                        'aws-native:inspectorv2:CisScanConfiguration': {
                            cf: 'AWS::InspectorV2::CisScanConfiguration',
                            inputs: {
                                targets: {
                                    $ref: '#/types/aws-native:inspectorv2:CisScanConfigurationCisTargets',
                                    description: "The CIS scan configuration's targets.",
                                },
                            },
                        },
                    },
                };
            },
            { virtual: true },
        );
        // WHEN
        const normalized = normalize(
            {
                Targets: {
                    TargetResourceTags: {
                        SomeTag: {
                            NestedProp: 'someval',
                        },
                    },
                },
            },
            'AWS::InspectorV2::CisScanConfiguration',
        );

        // THEN
        expect(normalized).toEqual({
            targets: {
                targetResourceTags: {
                    SomeTag: {
                        NestedProp: 'someval',
                    },
                },
            },
        });
    });

    test('normalize changes the case of nested properties through an Output eventual type', async () => {
        const normalized = normalize({
            'StreamEncryption': pulumi.output({
                EncryptionType: 'KMS',
                KeyId: 'alias/aws/kinesis'
            })
        });

        const finalValue = await awaitOutput(pulumi.output(normalized));

        expect(finalValue).toEqual({
            streamEncryption: {
                encryptionType: 'KMS',
                keyId: 'alias/aws/kinesis',
            }
        });
    });
});

function awaitOutput<T>(out: pulumi.Output<T>): Promise<T> {
    return new Promise((resolve, _reject) => {
        out.apply(v => {
            resolve(v);
            return v;
        })
    });
}
