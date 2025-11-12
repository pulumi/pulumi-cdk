import { IrIntrinsicValueAdapter, StackAddress, PropertyValue } from '@pulumi/cdk-convert-core';

const adapter = new IrIntrinsicValueAdapter();

function makeAddress(id: string): StackAddress {
    return { id, stackPath: '/test/stack' };
}

describe('IrIntrinsicValueAdapter', () => {
    test('returns override when mapping provides attribute', () => {
        const mapping = {
            resourceType: 'AWS::S3::Bucket',
            resource: {},
            attributes: {
                Arn: 'my-bucket-arn' as PropertyValue,
            },
        };

        const result = adapter.getResourceAttribute({
            mapping,
            attribute: 'Arn',
            propertyName: 'arn',
            resourceAddress: makeAddress('BucketResource'),
        });

        expect(result).toBe('my-bucket-arn');
    });

    test('creates resource attribute reference when no override exists', () => {
        const mapping = {
            resourceType: 'AWS::SQS::Queue',
            resource: {},
        };

        const resourceAddress = makeAddress('QueueResource');
        const result = adapter.getResourceAttribute({
            mapping,
            attribute: 'Arn',
            propertyName: 'arn',
            resourceAddress,
        });

        expect(result).toEqual({
            kind: 'resourceAttribute',
            resource: resourceAddress,
            attributeName: 'Arn',
            propertyName: 'arn',
        });
    });
});
