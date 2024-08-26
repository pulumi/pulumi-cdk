import { normalize } from '../src/interop';
import {
    isJsonType,
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
        const isJson = isJsonType(propName, properties, types, pulumiProvider);

        // THEN
        expect(isJson).toEqual(false);
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
        const isJson = isJsonType(propName, properties, types, pulumiProvider);

        // THEN
        expect(isJson).toEqual(true);
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
        const isJson = isJsonType(propName, properties, types, pulumiProvider);

        // THEN
        expect(isJson).toEqual(true);
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
});
