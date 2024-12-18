import { StackManifest } from '../../src/assembly';

describe('StackManifest', () => {
    test('Throws if template has no resources', () => {
        expect(() => {
            new StackManifest({
                id: 'id',
                templatePath: 'path',
                metadata: {},
                tree: { id: 'id', path: 'path' },
                template: {},
                nestedStacks: {},
                dependencies: [],
            });
        }).toThrow(/CloudFormation template has no resources/);
    });

    test('can get logicalId for path', () => {
        const stack = new StackManifest({
            id: 'id',
            templatePath: 'path',
            metadata: {
                'stack/bucket': { stackPath: 'stack', id: 'SomeBucket' },
            },
            nestedStacks: {},
            tree: {
                id: 'id',
                path: 'path',
            },
            template: {
                Resources: {
                    SomeBucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: {},
                    },
                },
            },
            dependencies: [],
        });
        expect(stack.resourceAddressForPath('stack/bucket')).toEqual({ stackPath: 'stack', id: 'SomeBucket' });
    });

    test('can get resource for logicalId', () => {
        const stack = new StackManifest({
            id: 'stack',
            templatePath: 'path',
            metadata: {
                'stack/bucket': { stackPath: 'stack', id: 'SomeBucket' },
            },
            nestedStacks: {},
            tree: {
                id: 'stack',
                path: 'stack',
            },
            template: {
                Resources: {
                    SomeBucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: { Key: 'Value' },
                    },
                },
            },
            dependencies: [],
        });
        expect(stack.resourceWithLogicalId('stack', 'SomeBucket')).toEqual({
            Type: 'AWS::S3::Bucket',
            Properties: { Key: 'Value' },
        });
    });

    test('getNestedStackPath throws if path is too short', () => {
        expect(() => {
            StackManifest.getNestedStackPath('short/path', 'logicalId');
        }).toThrow(/The path is too short/);
    });

    test('getNestedStackPath throws if path does not end with .NestedStack', () => {
        expect(() => {
            StackManifest.getNestedStackPath('parent/child/invalidPath', 'logicalId');
        }).toThrow(/The path does not end with '.NestedStack'/);
    });

    test('getNestedStackPath returns correct nested stack path', () => {
        const nestedStackPath = StackManifest.getNestedStackPath('parent/child.NestedStack/child.NestedStackResource', 'logicalId');
        expect(nestedStackPath).toBe('parent/child');
    });
});
