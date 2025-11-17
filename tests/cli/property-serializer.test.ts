import { PropertySerializationContext, serializePropertyValue } from '../../src/cli/property-serializer';
import {
    ConcatValue,
    ResourceAttributeReference,
    SsmDynamicReferenceValue,
    SecretsManagerDynamicReferenceValue,
    StackAddress,
} from '@pulumi/cdk-convert-core';

function makeCtx(overrides?: Partial<PropertySerializationContext>): PropertySerializationContext {
    return {
        getResourceName: (addr: StackAddress) => `${addr.stackPath}-${addr.id}`,
        getStackOutputName: () => 'AppOutputs_bucketName',
        getParameterDefault: () => 'param-default',
        ...overrides,
    };
}

describe('serializePropertyValue', () => {
    test('serializes primitive structures', () => {
        const ctx = makeCtx();
        expect(serializePropertyValue('value', ctx)).toBe('value');
        expect(serializePropertyValue(42, ctx)).toBe(42);
        expect(serializePropertyValue(true, ctx)).toBe(true);
        expect(serializePropertyValue(null, ctx)).toBeNull();

        expect(
            serializePropertyValue(
                {
                    Foo: ['bar', 'baz'],
                },
                ctx,
            ),
        ).toEqual({
            Foo: ['bar', 'baz'],
        });
    });

    test('serializes resource attribute references into interpolations', () => {
        const ctx = makeCtx();
        const ref: ResourceAttributeReference = {
            kind: 'resourceAttribute',
            attributeName: 'Arn',
            propertyName: 'arn',
            resource: { id: 'Bucket', stackPath: 'Stacks/Main' },
        };

        expect(serializePropertyValue(ref, ctx)).toBe('${Stacks/Main-Bucket.arn}');
    });

    test('serializes parameter references using defaults', () => {
        const ctx = makeCtx({
            getParameterDefault: () => ({
                nested: 'value',
            }),
        });

        const result = serializePropertyValue(
            {
                kind: 'parameter',
                stackPath: 'Stacks/Main',
                parameterName: 'Env',
            },
            ctx,
        );

        expect(result).toEqual({
            nested: 'value',
        });
    });

    test('serializes concat values into fn::join', () => {
        const ctx = makeCtx();
        const concat: ConcatValue = {
            kind: 'concat',
            delimiter: '-',
            values: ['prefix', { kind: 'stackOutput', stackPath: 'Stacks/Main', outputName: 'BucketName' }],
        };

        expect(serializePropertyValue(concat, ctx)).toEqual({
            'fn::join': ['-', ['prefix', '${AppOutputs_bucketName}']],
        });
    });

    test('serializes SSM dynamic references', () => {
        const ctx = makeCtx();
        const ssm: SsmDynamicReferenceValue = {
            kind: 'ssmDynamicReference',
            parameterName: '/config/value',
            secure: true,
        };

        expect(serializePropertyValue(ssm, ctx)).toEqual({
            'fn::secret': {
                'fn::invoke': {
                    function: 'aws:ssm:getParameter',
                    arguments: {
                        name: '/config/value',
                        withDecryption: true,
                    },
                    return: 'value',
                },
            },
        });
    });

    test('serializes Secrets Manager dynamic references', () => {
        const ctx = makeCtx();
        const secret: SecretsManagerDynamicReferenceValue = {
            kind: 'secretsManagerDynamicReference',
            secretId: 'my-secret',
        };

        expect(serializePropertyValue(secret, ctx)).toEqual({
            'fn::secret': {
                'fn::invoke': {
                    function: 'aws:secretsmanager:getSecretVersion',
                    arguments: {
                        secretId: 'my-secret',
                    },
                    return: 'secretString',
                },
            },
        });
    });

    test('throws when parameter defaults are missing', () => {
        const ctx = makeCtx({
            getParameterDefault: () => undefined,
        });

        expect(() =>
            serializePropertyValue(
                {
                    kind: 'parameter',
                    stackPath: 'Stacks/Main',
                    parameterName: 'Env',
                },
                ctx,
            ),
        ).toThrow(/parameter Env/i);
    });

    test('throws when secrets manager jsonKey is set', () => {
        const ctx = makeCtx();
        const secret: SecretsManagerDynamicReferenceValue = {
            kind: 'secretsManagerDynamicReference',
            secretId: 'my-secret',
            jsonKey: 'password',
        };

        expect(() => serializePropertyValue(secret, ctx)).toThrow(/jsonKey/i);
    });
});
