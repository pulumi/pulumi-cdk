import { normalize } from '../src/interop';
import {
    getNativeType,
    Metadata,
    NativeType,
    processMetadataProperty,
    PulumiProperty,
    PulumiType,
    UnknownCfnType,
} from '../src/pulumi-metadata';
import { PulumiProvider } from '../src/types';

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
                'aws-native:inspectorv2:CisScanConfiguration': {
                    cf: 'AWS::InspectorV2::CisScanConfiguration',
                    inputs: {
                        targets: {
                            $ref: '#/types/aws-native:inspectorv2:CisScanConfigurationCisTargets',
                            description: "The CIS scan configuration's targets.",
                        },
                    },
                },
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
beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();
});
describe('metadata', () => {
    test('metadata.findResource', () => {
        // GIVEN
        const meta = new Metadata(PulumiProvider.AWS_NATIVE);

        // WHEN
        const res = meta.findResource('AWS::S3::Bucket');

        // THEN
        expect(res.inputs).toEqual({ bucketName: { type: 'string' } });
    });
    test('metadata.findResource error', () => {
        // GIVEN
        const meta = new Metadata(PulumiProvider.AWS_NATIVE);

        // THEN
        expect(() => {
            meta.findResource('AWS::S3::Error');
        }).toThrow(UnknownCfnType);
    });
    test('metadata.types', () => {
        // GIVEN
        const meta = new Metadata(PulumiProvider.AWS_NATIVE);

        // THEN
        expect(meta.types()).toMatchObject({
            'aws-native:lambda:FunctionEnvironment': expect.anything(),
        });
    });
});

describe('processMetadataProperty', () => {
    test('non-object type', () => {
        // GIVEN
        const property: PulumiProperty = { type: 'string' };
        const types = {};
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const { nativeType, meta } = processMetadataProperty(property, types, pulumiProvider);

        // THEN
        expect(meta).toBeUndefined();
        expect(nativeType).toEqual(NativeType.NON_JSON);
    });

    test('pulumi json type', () => {
        // GIVEN
        const property: PulumiProperty = { $ref: 'pulumi.json#/Any' };
        const types = {};
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const { nativeType, meta } = processMetadataProperty(property, types, pulumiProvider);

        // THEN
        expect(meta).toBeUndefined();
        expect(nativeType).toEqual(NativeType.JSON);
    });

    test('pulumi type', () => {
        // GIVEN
        const property: PulumiProperty = { $ref: 'pulumi.somethingelse' };
        const types = {};
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const { nativeType, meta } = processMetadataProperty(property, types, pulumiProvider);

        // THEN
        expect(meta).toBeUndefined();
        expect(nativeType).toEqual(NativeType.NON_JSON);
    });

    test('pulumi object type', () => {
        // GIVEN
        const property: PulumiProperty = { type: 'object' };
        const types = {};
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const { nativeType, meta } = processMetadataProperty(property, types, pulumiProvider);

        // THEN
        expect(meta).toBeUndefined();
        expect(nativeType).toEqual(NativeType.JSON);
    });

    test('array non-object type', () => {
        // GIVEN
        const property: PulumiProperty = { type: 'array', items: { type: 'string' } };
        const types = {};
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const { nativeType, meta } = processMetadataProperty(property, types, pulumiProvider);

        // THEN
        expect(meta).toBeUndefined();
        expect(nativeType).toEqual(NativeType.NON_JSON);
    });

    test('array object type', () => {
        // GIVEN
        const property: PulumiProperty = { type: 'array', items: { type: 'object' } };
        const types = {};
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const { nativeType, meta } = processMetadataProperty(property, types, pulumiProvider);

        // THEN
        expect(meta).toBeUndefined();
        expect(nativeType).toEqual(NativeType.JSON);
    });

    test('ref to object type', () => {
        // GIVEN
        const property: PulumiProperty = { type: 'object', $ref: '#/types/aws-native:SomeType' };
        const types: { [key: string]: PulumiType } = {
            'aws-native:SomeType': {
                properties: {
                    SomeKey: {
                        type: 'string',
                    },
                },
            },
        };
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const { nativeType, meta } = processMetadataProperty(property, types, pulumiProvider);

        // THEN
        expect(meta).toEqual({ SomeKey: { type: 'string' } });
        expect(nativeType).toBeUndefined();
    });
});

describe('isJsonType', () => {
    test('top level property: false', () => {
        // GIVEN
        const propName = ['Key'];
        const properties: { [key: string]: PulumiProperty } = {
            key: {
                type: 'string',
            },
        };
        const types: { [key: string]: PulumiType } = {};
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const isJson = getNativeType(propName, properties, types, pulumiProvider);

        // THEN
        expect(isJson).toEqual(NativeType.NON_JSON);
    });

    test('top level property: true', () => {
        // GIVEN
        const propName = ['Key'];
        const properties: { [key: string]: PulumiProperty } = {
            key: {
                type: 'object',
            },
        };
        const types: { [key: string]: PulumiType } = {};
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const isJson = getNativeType(propName, properties, types, pulumiProvider);

        // THEN
        expect(isJson).toEqual(NativeType.JSON);
    });

    test('nested property: true', () => {
        // GIVEN
        const propName = ['Key', 'NestedKey'];
        const properties: { [key: string]: PulumiProperty } = {
            key: {
                $ref: '#/types/aws-native:SomeType',
            },
        };
        const types: { [key: string]: PulumiType } = {
            'aws-native:SomeType': { properties: { nestedKey: { type: 'object' } } },
        };
        const pulumiProvider = PulumiProvider.AWS_NATIVE;

        // WHEN
        const isJson = getNativeType(propName, properties, types, pulumiProvider);

        // THEN
        expect(isJson).toEqual(NativeType.JSON);
    });
});

describe('normalize', () => {
    test('resource not in metadata', () => {
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
});
