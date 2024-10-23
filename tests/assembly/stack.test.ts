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
                dependencies: [],
            });
        }).toThrow(/CloudFormation template has no resources/);
    });

    test('can get logicalId for path', () => {
        const stack = new StackManifest({
            id: 'id',
            templatePath: 'path',
            metadata: {
                'stack/bucket': 'SomeBucket',
            },
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
        expect(stack.logicalIdForPath('stack/bucket')).toEqual('SomeBucket');
    });

    test('can get resource for path', () => {
        const stack = new StackManifest({
            id: 'id',
            templatePath: 'path',
            metadata: {
                'stack/bucket': 'SomeBucket',
            },
            tree: {
                id: 'id',
                path: 'path',
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
        expect(stack.resourceWithPath('stack/bucket')).toEqual({
            Type: 'AWS::S3::Bucket',
            Properties: { Key: 'Value' },
        });
    });

    test('can get resource for logicalId', () => {
        const stack = new StackManifest({
            id: 'id',
            templatePath: 'path',
            metadata: {
                'stack/bucket': 'SomeBucket',
            },
            tree: {
                id: 'id',
                path: 'path',
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
        expect(stack.resourceWithLogicalId('SomeBucket')).toEqual({
            Type: 'AWS::S3::Bucket',
            Properties: { Key: 'Value' },
        });
    });
});
