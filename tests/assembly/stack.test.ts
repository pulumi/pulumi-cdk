import { StackManifest } from '../../src/assembly';

describe('StackManifest', () => {
    test('Throws if template has no resources', () => {
        expect(() => {
            new StackManifest('dir', 'id', 'path', {}, { id: 'id', path: 'path' }, {}, []);
        }).toThrow(/CloudFormation template has no resources/);
    });

    test('get file assets', () => {
        const stack = new StackManifest(
            'dir',
            'id',
            'path',
            {},
            { id: 'id', path: 'path' },
            {
                Resources: { SomeResource: { Type: 'sometype', Properties: {} } },
            },
            [
                {
                    id: {
                        assetId: 'asset',
                        destinationId: 'dest',
                    },
                    type: 'file',
                    source: { path: 'somepath' },
                    destination: { objectKey: 'abc', bucketName: 'bucket' },
                    genericSource: {},
                    genericDestination: {},
                },
                {
                    id: {
                        assetId: 'asset2',
                        destinationId: 'dest2',
                    },
                    type: 'docker-image',
                    source: {},
                    destination: { imageTag: 'tag', repositoryName: 'repop' },
                    genericSource: {},
                    genericDestination: {},
                },
            ],
        );
        expect(stack.fileAssets.length).toEqual(1);
        expect(stack.fileAssets[0]).toEqual({
            destination: {
                bucketName: 'bucket',
                objectKey: 'abc',
            },
            id: {
                assetId: 'asset',
                destinationId: 'dest',
            },
            packaging: 'file',
            path: 'dir/somepath',
        });
    });

    test('can get logicalId for path', () => {
        const stack = new StackManifest(
            'dir',
            'id',
            'path',
            {
                'stack/bucket': 'SomeBucket',
            },
            {
                id: 'id',
                path: 'path',
            },
            {
                Resources: {
                    SomeBucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: {},
                    },
                },
            },
            [],
        );
        expect(stack.logicalIdForPath('stack/bucket')).toEqual('SomeBucket');
    });

    test('can get resource for path', () => {
        const stack = new StackManifest(
            'dir',
            'id',
            'path',
            {
                'stack/bucket': 'SomeBucket',
            },
            {
                id: 'id',
                path: 'path',
            },
            {
                Resources: {
                    SomeBucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: { Key: 'Value' },
                    },
                },
            },
            [],
        );
        expect(stack.resourceWithPath('stack/bucket')).toEqual({
            Type: 'AWS::S3::Bucket',
            Properties: { Key: 'Value' },
        });
    });

    test('can get resource for logicalId', () => {
        const stack = new StackManifest(
            'dir',
            'id',
            'path',
            {
                'stack/bucket': 'SomeBucket',
            },
            {
                id: 'id',
                path: 'path',
            },
            {
                Resources: {
                    SomeBucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: { Key: 'Value' },
                    },
                },
            },
            [],
        );
        expect(stack.resourceWithLogicalId('SomeBucket')).toEqual({
            Type: 'AWS::S3::Bucket',
            Properties: { Key: 'Value' },
        });
    });
});
