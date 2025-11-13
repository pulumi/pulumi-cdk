import {
    CloudFormationTemplate,
    ConcatValue,
    IntrinsicValueAdapter,
    IrIntrinsicResolver,
    IrIntrinsicValueAdapter,
    PropertyValue,
    ResourceAttributeReference,
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

    test('Refs point at resource id property by default', () => {
        const resolver = createResolver({}, new IrIntrinsicValueAdapter());
        const value = resolver.resolveValue({
            Ref: 'MyBucket',
        }) as ResourceAttributeReference;

        expect(value.propertyName).toBe('id');
    });
});
