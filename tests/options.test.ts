import * as native from '@pulumi/aws-native';
import * as pulumi from '@pulumi/pulumi';
import { StackManifest } from '../src/assembly';
import { StackConverter } from '../src/converters/app-converter';
import { MockAppComponent } from './mocks';
import { CfnDeletionPolicy } from 'aws-cdk-lib';
jest.mock('@pulumi/pulumi', () => {
    return {
        ...jest.requireActual('@pulumi/pulumi'),
        CustomResource: jest.fn().mockImplementation(() => {
            return {};
        }),
    };
});

afterAll(() => {
    jest.resetAllMocks();
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('options', () => {
    test('retainOnDelete true when DeletionPolicy=Retain', async () => {
        const manifest = new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/bucket': { stackPath: 'stack', id: 'bucket' },
            },
            nestedStacks: {},
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    bucket: {
                        id: 'bucket',
                        path: 'stack/bucket',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                        },
                    },
                },
                constructInfo: {
                    fqn: 'aws-cdk-lib.Stack',
                    version: '2.149.0',
                },
            },
            template: {
                Resources: {
                    bucket: {
                        Type: 'AWS::S3::Bucket',
                        DeletionPolicy: CfnDeletionPolicy.RETAIN,
                        Properties: {},
                    },
                },
            },
            dependencies: [],
        });
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);
        converter.convert(new Set());
        expect(pulumi.CustomResource).toHaveBeenCalledWith(
            'aws-native:s3:Bucket',
            'bucket',
            expect.anything(),
            expect.objectContaining({
                retainOnDelete: true,
            }),
        );
    });

    test('retainOnDelete true when DeletionPolicy=RetainExceptOnCreate', async () => {
        const manifest = new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/bucket': { stackPath: 'stack', id: 'bucket' },
            },
            nestedStacks: {},
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    bucket: {
                        id: 'bucket',
                        path: 'stack/bucket',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                        },
                    },
                },
                constructInfo: {
                    fqn: 'aws-cdk-lib.Stack',
                    version: '2.149.0',
                },
            },
            template: {
                Resources: {
                    bucket: {
                        Type: 'AWS::S3::Bucket',
                        DeletionPolicy: CfnDeletionPolicy.RETAIN_EXCEPT_ON_CREATE,
                        Properties: {},
                    },
                },
            },
            dependencies: [],
        });
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);
        converter.convert(new Set());
        expect(pulumi.CustomResource).toHaveBeenCalledWith(
            'aws-native:s3:Bucket',
            'bucket',
            expect.anything(),
            expect.objectContaining({
                retainOnDelete: true,
            }),
        );
    });

    test('retainOnDelete false when DeletionPolicy=Delete', async () => {
        const manifest = new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/bucket': { stackPath: 'stack', id: 'bucket' },
            },
            nestedStacks: {},
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    bucket: {
                        id: 'bucket',
                        path: 'stack/bucket',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                        },
                    },
                },
                constructInfo: {
                    fqn: 'aws-cdk-lib.Stack',
                    version: '2.149.0',
                },
            },
            template: {
                Resources: {
                    bucket: {
                        Type: 'AWS::S3::Bucket',
                        DeletionPolicy: CfnDeletionPolicy.DELETE,
                        Properties: {},
                    },
                },
            },
            dependencies: [],
        });
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);
        converter.convert(new Set());
        expect(pulumi.CustomResource).toHaveBeenCalledWith(
            'aws-native:s3:Bucket',
            'bucket',
            expect.anything(),
            expect.objectContaining({
                retainOnDelete: false,
            }),
        );
    });

    test('retainOnDelete true when DeletionPolicy=Snapshot', async () => {
        const manifest = new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/bucket': { stackPath: 'stack', id: 'bucket' },
            },
            nestedStacks: {},
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    bucket: {
                        id: 'bucket',
                        path: 'stack/bucket',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                        },
                    },
                },
                constructInfo: {
                    fqn: 'aws-cdk-lib.Stack',
                    version: '2.149.0',
                },
            },
            template: {
                Resources: {
                    bucket: {
                        Type: 'AWS::S3::Bucket',
                        DeletionPolicy: CfnDeletionPolicy.SNAPSHOT,
                        Properties: {},
                    },
                },
            },
            dependencies: [],
        });
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);
        converter.convert(new Set());
        expect(pulumi.CustomResource).toHaveBeenCalledWith(
            'aws-native:s3:Bucket',
            'bucket',
            expect.anything(),
            expect.objectContaining({
                retainOnDelete: true,
            }),
        );
    });

    test('retainOnDelete not set', async () => {
        const manifest = new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/bucket': { stackPath: 'stack', id: 'bucket' },
            },
            nestedStacks: {},
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    bucket: {
                        id: 'bucket',
                        path: 'stack/bucket',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                        },
                    },
                },
                constructInfo: {
                    fqn: 'aws-cdk-lib.Stack',
                    version: '2.149.0',
                },
            },
            template: {
                Resources: {
                    bucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: {},
                    },
                },
            },
            dependencies: [],
        });
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);
        converter.convert(new Set());
        expect(pulumi.CustomResource).toHaveBeenCalledWith(
            'aws-native:s3:Bucket',
            'bucket',
            expect.anything(),
            expect.not.objectContaining({
                retainOnDelete: false,
            }),
        );
    });

    test('provider can be set at stack level', async () => {
        const manifest = new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/bucket': { stackPath: 'stack', id: 'bucket' },
            },
            nestedStacks: {},
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    bucket: {
                        id: 'bucket',
                        path: 'stack/bucket',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                        },
                    },
                },
                constructInfo: {
                    fqn: 'aws-cdk-lib.Stack',
                    version: '2.149.0',
                },
            },
            template: {
                Resources: {
                    bucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: {},
                    },
                },
            },
            dependencies: [],
        });
        const appComponent = new MockAppComponent('/tmp/foo/bar/does/not/exist');

        appComponent.stackOptions['stack'] = {
            providers: [
                new native.Provider('test-native', {
                    region: 'us-west-2',
                }),
            ],
        };
        const converter = new StackConverter(appComponent, manifest);
        converter.convert(new Set());
        expect(pulumi.CustomResource).toHaveBeenCalledWith(
            'aws-native:s3:Bucket',
            'bucket',
            expect.anything(),
            expect.objectContaining({
                parent: expect.objectContaining({
                    __name: 'stack/stack',
                    __providers: expect.objectContaining({
                        'aws-native': expect.objectContaining({ __name: 'test-native' }),
                    }),
                }),
            }),
        );
    });
});
