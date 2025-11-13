import {
    CloudFormationTemplate,
    ConcatValue,
    IntrinsicValueAdapter,
    IrIntrinsicResolver,
    IrIntrinsicValueAdapter,
    PropertyValue,
    ResourceAttributeReference,
    ResourceMetadataProvider,
    CfRefBehavior,
} from '@pulumi/cdk-convert-core';

class StubIntrinsicValueAdapter implements IntrinsicValueAdapter<any, PropertyValue> {
    getResourceAttribute(request: {
        resourceAddress: { stackPath: string; id: string };
        attribute: string;
        propertyName?: string;
    }): PropertyValue {
        return <ResourceAttributeReference>{
            kind: 'resourceAttribute',
            resource: request.resourceAddress,
            attributeName: request.attribute,
            propertyName: request.propertyName,
        };
    }
}

function createResolver(
    overrides: Partial<CloudFormationTemplate> = {},
    adapter: IntrinsicValueAdapter<any, PropertyValue> = new StubIntrinsicValueAdapter(),
) {
    const template: CloudFormationTemplate = {
        Resources: {
            MyBucket: {
                Type: 'AWS::S3::Bucket',
                Properties: {},
            },
        },
        ...overrides,
    } as CloudFormationTemplate;

    return new IrIntrinsicResolver({
        stackPath: 'App/Main',
        template,
        adapter,
    });
}

const emptyMetadata: ResourceMetadataProvider = {
    tryFindResource: () => undefined,
};

function metadataWithCfRef(cfRef: CfRefBehavior): ResourceMetadataProvider {
    return {
        tryFindResource: () => ({
            inputs: {},
            outputs: {},
            cfRef,
        }),
    };
}

describe('IrIntrinsicResolver intrinsics', () => {
    test('resolves Fn::Sub with inline variables', () => {
        const resolver = createResolver();
        const value = resolver.resolveValue({
            'Fn::Sub': ['prefix-${Var}-suffix', { Var: 'VALUE' }],
        });

        expect(value).toBe('prefix-VALUE-suffix');
    });

    test('resolves Fn::Sub references to resource attributes', () => {
        const resolver = createResolver();
        const value = resolver.resolveValue({
            'Fn::Sub': 'arn:${MyBucket.Arn}:suffix',
        }) as ConcatValue;

        expect(value).toEqual({
            kind: 'concat',
            delimiter: '',
            values: [
                'arn:',
                {
                    kind: 'resourceAttribute',
                    resource: { stackPath: 'App/Main', id: 'MyBucket' },
                    attributeName: 'Arn',
                    propertyName: 'Arn',
                },
                ':suffix',
            ],
        });
    });

    test('resolves Fn::Select', () => {
        const resolver = createResolver();
        const value = resolver.resolveValue({
            'Fn::Select': [1, ['a', 'b', 'c']],
        });

        expect(value).toBe('b');
    });

    test('resolves Fn::Base64', () => {
        const resolver = createResolver();
        const value = resolver.resolveValue({
            'Fn::Base64': 'plain-text',
        });

        expect(value).toBe(Buffer.from('plain-text').toString('base64'));
    });

    test('resolves Fn::FindInMap', () => {
        const resolver = createResolver({
            Mappings: {
                RegionMap: {
                    'us-east-1': {
                        HVM64: 'ami-123',
                    },
                },
            },
        });

        const value = resolver.resolveValue({
            'Fn::FindInMap': ['RegionMap', 'us-east-1', 'HVM64'],
        });

        expect(value).toBe('ami-123');
    });

    test('throws for unsupported Fn::ImportValue', () => {
        const resolver = createResolver();
        expect(() =>
            resolver.resolveValue({
                'Fn::ImportValue': 'SharedValue',
            }),
        ).toThrow('Fn::ImportValue is not yet supported.');
    });

    test('throws for unsupported Fn::Transform', () => {
        const resolver = createResolver();
        expect(() =>
            resolver.resolveValue({
                'Fn::Transform': {
                    Name: 'AWS::Include',
                },
            }),
        ).toThrow('Fn::Transform is not supported – Cfn Template Macros are not supported yet');
    });

    test('throws for unsupported Fn::Cidr', () => {
        const resolver = createResolver();
        expect(() =>
            resolver.resolveValue({
                'Fn::Cidr': ['10.0.0.0/16', 4, 8],
            }),
        ).toThrow('Fn::Cidr is not supported in IR conversion yet');
    });

    test('throws for unsupported Fn::GetAZs', () => {
        const resolver = createResolver();
        expect(() =>
            resolver.resolveValue({
                'Fn::GetAZs': '',
            }),
        ).toThrow('Fn::GetAZs is not supported in IR conversion yet');
    });

    test('Refs point at resource id property when metadata is missing', () => {
        const resolver = createResolver({}, new IrIntrinsicValueAdapter(emptyMetadata));
        const value = resolver.resolveValue({
            Ref: 'MyBucket',
        }) as ResourceAttributeReference;

        expect(value.propertyName).toBe('id');
    });

    test('Refs use cfRef property metadata when available', () => {
        const resolver = createResolver({}, new IrIntrinsicValueAdapter(metadataWithCfRef({ property: 'BucketName' })));
        const value = resolver.resolveValue({
            Ref: 'MyBucket',
        }) as ResourceAttributeReference;

        expect(value.propertyName).toBe('bucketName');
    });

    test('Refs concatenate multiple metadata properties with delimiter', () => {
        const resolver = createResolver(
            {},
            new IrIntrinsicValueAdapter(metadataWithCfRef({ properties: ['Region', 'AccountId'], delimiter: ':' })),
        );
        const value = resolver.resolveValue({
            Ref: 'MyBucket',
        }) as ConcatValue;

        expect(value.delimiter).toBe(':');
        expect(value.values).toHaveLength(2);
        expect(value.values[0]).toMatchObject({ propertyName: 'region' });
        expect(value.values[1]).toMatchObject({ propertyName: 'accountId' });
    });

    test('Refs throw when metadata marks cfRef unsupported', () => {
        const resolver = createResolver({}, new IrIntrinsicValueAdapter(metadataWithCfRef({ notSupported: true })));
        expect(() =>
            resolver.resolveValue({
                Ref: 'MyBucket',
            }),
        ).toThrow('Ref intrinsic is not supported for the AWS::S3::Bucket resource type');
    });
});
