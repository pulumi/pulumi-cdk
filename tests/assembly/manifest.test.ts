import * as path from 'path';
import * as mockfs from 'mock-fs';
import { AssemblyManifestReader } from '../../src/assembly';

describe('cloud assembly manifest reader', () => {
    describe('single stack', () => {
        const manifestFile = '/tmp/foo/bar/does/not/exist/manifest.json';
        const manifestStack = '/tmp/foo/bar/does/not/exist/test-stack.template.json';
        const manifestTree = '/tmp/foo/bar/does/not/exist/tree.json';
        const manifestAssets = '/tmp/foo/bar/does/not/exist/test-stack.assets.json';
        beforeEach(() => {
            mockfs({
                // Recursively loads all node_modules
                node_modules: {
                    'aws-cdk-lib': mockfs.load(path.resolve(__dirname, '../../node_modules/aws-cdk-lib')),
                    '@pulumi': {
                        aws: mockfs.load(path.resolve(__dirname, '../../node_modules/@pulumi/aws')),
                        'aws-native': mockfs.load(path.resolve(__dirname, '../../node_modules/@pulumi/aws-native')),
                    },
                },
                [manifestAssets]: JSON.stringify({
                    version: '36.0.0',
                    files: {
                        abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44: {
                            source: {
                                path: 'asset.abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44',
                                packaging: 'zip',
                            },
                            destinations: {
                                'current_account-current_region': {
                                    bucketName: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                                    objectKey: 'abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44.zip',
                                },
                            },
                        },
                        cd12352cc95113284dfa6575f1d74d8dea52dddcaa2f46fa695b33b59c1b4579: {
                            source: {
                                path: 'stack.template.json',
                                packaging: 'file',
                            },
                            destinations: {
                                'current_account-current_region': {
                                    bucketName: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                                    objectKey: 'cd12352cc95113284dfa6575f1d74d8dea52dddcaa2f46fa695b33b59c1b4579.json',
                                },
                            },
                        },
                    },
                    dockerImages: {},
                }),
                [manifestTree]: JSON.stringify({
                    version: 'tree-0.1',
                    tree: {
                        id: 'App',
                        path: '',
                        children: {
                            'test-stack': {
                                id: 'test-stack',
                                path: 'test-stack',
                            },
                        },
                    },
                }),
                [manifestStack]: JSON.stringify({
                    Resources: {
                        MyFunction1ServiceRole9852B06B: {
                            Type: 'AWS::IAM::Role',
                            Properties: {},
                        },
                        MyFunction12A744C2E: {
                            Type: 'AWS::Lambda::Function',
                            Properties: {},
                        },
                    },
                }),
                [manifestFile]: JSON.stringify({
                    version: '17.0.0',
                    artifacts: {
                        'test-stack.assets': {
                            type: 'cdk:asset-manifest',
                            properties: {
                                file: 'test-stack.assets.json',
                            },
                        },
                        Tree: {
                            type: 'cdk:tree',
                            properties: {
                                file: 'tree.json',
                            },
                        },
                        'test-stack': {
                            type: 'aws:cloudformation:stack',
                            environment: 'aws://unknown-account/unknown-region',
                            properties: {
                                templateFile: 'test-stack.template.json',
                                validateOnSynth: false,
                            },
                            metadata: {
                                '/test-stack/MyFunction1/ServiceRole/Resource': [
                                    {
                                        type: 'aws:cdk:logicalId',
                                        data: 'MyFunction1ServiceRole9852B06B',
                                    },
                                ],
                                '/test-stack/MyFunction1/Resource': [
                                    {
                                        type: 'aws:cdk:logicalId',
                                        data: 'MyFunction12A744C2E',
                                    },
                                ],
                            },
                            displayName: 'test-stack',
                        },
                    },
                }),
            });
        });

        afterEach(() => {
            mockfs.restore();
        });

        test('throws if manifest file not found', () => {
            expect(() => {
                AssemblyManifestReader.fromDirectory('some-other-file');
            }).toThrow(/Cannot read manifest at 'some-other-file\/manifest.json'/);
        });

        test('can read manifest from path', () => {
            expect(() => {
                AssemblyManifestReader.fromDirectory(path.dirname(manifestFile));
            }).not.toThrow();
        });

        test('fromPath sets directory correctly', () => {
            const manifest = AssemblyManifestReader.fromDirectory(path.dirname(manifestFile));
            expect(manifest.directory).toEqual('/tmp/foo/bar/does/not/exist');
        });

        test('can get stacks from manifest', () => {
            const manifest = AssemblyManifestReader.fromDirectory(path.dirname(manifestFile));

            expect(manifest.stackManifests[0]).toEqual({
                constructTree: { id: 'test-stack', path: 'test-stack' },
                dependencies: [],
                id: 'test-stack',
                metadata: {
                    'test-stack/MyFunction1/Resource': { stackPath: 'test-stack', id: 'MyFunction12A744C2E' },
                    'test-stack/MyFunction1/ServiceRole/Resource': {
                        stackPath: 'test-stack',
                        id: 'MyFunction1ServiceRole9852B06B',
                    },
                },
                stacks: {
                    'test-stack': {
                        Resources: {
                            MyFunction12A744C2E: { Properties: {}, Type: 'AWS::Lambda::Function' },
                            MyFunction1ServiceRole9852B06B: { Properties: {}, Type: 'AWS::IAM::Role' },
                        },
                    },
                },
                templatePath: 'test-stack.template.json',
            });
        });
    });

    describe('nested stacks', () => {
        afterEach(() => {
            mockfs.restore();
        });

        test('can read manifest with nested stacks', () => {
            const manifestDir = path.join(__dirname, '../test-data/nested-stack');
            const manifests = AssemblyManifestReader.fromDirectory(manifestDir).stackManifests;
            expect(manifests.length).toEqual(1);
            const manifest = manifests[0];
            expect(Object.keys(manifest.stacks)).toEqual(['teststack', 'teststack/nesty']);
            expect(Object.keys(manifest.stacks['teststack'].Resources ?? {}).length).toEqual(7);
            expect(Object.keys(manifest.stacks['teststack/nesty'].Resources ?? {}).length).toEqual(5);
        });

        test('throws if nested stack template is not found', () => {
            const manifestFile = '/tmp/foo/bar/does/not/exist/manifest.json';
            const manifestStack = '/tmp/foo/bar/does/not/exist/test-stack.template.json';
            const manifestTree = '/tmp/foo/bar/does/not/exist/tree.json';
            const manifestAssets = '/tmp/foo/bar/does/not/exist/test-stack.assets.json';
            mockfs({
                [manifestAssets]: JSON.stringify({
                    version: '36.0.0',
                    files: {
                        abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44: {
                            source: {
                                path: 'asset.abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44',
                                packaging: 'zip',
                            },
                            destinations: {
                                'current_account-current_region': {
                                    bucketName: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                                    objectKey: 'abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44.zip',
                                },
                            },
                        },
                        cd12352cc95113284dfa6575f1d74d8dea52dddcaa2f46fa695b33b59c1b4579: {
                            source: {
                                path: 'stack.template.json',
                                packaging: 'file',
                            },
                            destinations: {
                                'current_account-current_region': {
                                    bucketName: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                                    objectKey: 'cd12352cc95113284dfa6575f1d74d8dea52dddcaa2f46fa695b33b59c1b4579.json',
                                },
                            },
                        },
                    },
                    dockerImages: {},
                }),
                [manifestTree]: JSON.stringify({
                    version: 'tree-0.1',
                    tree: {
                        id: 'App',
                        path: '',
                        children: {
                            'test-stack': {
                                id: 'test-stack',
                                path: 'test-stack',
                                children: {
                                    MyNestedStack: {
                                        id: 'MyNestedStack',
                                        path: 'test-stack/MyNestedStack',
                                    },
                                    'MyNestedStack.NestedStack': {
                                        id: 'MyNestedStack.NestedStack',
                                        path: 'test-stack/MyNestedStack.NestedStack',
                                        children: {
                                            'MyNestedStack.NestedStackResource': {
                                                id: 'MyNestedStack.NestedStackResource',
                                                path: 'test-stack/MyNestedStack.NestedStack/MyNestedStack.NestedStackResource',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
                [manifestStack]: JSON.stringify({
                    Resources: {
                        MyNestedStack: {
                            Type: 'AWS::CloudFormation::Stack',
                            Properties: {},
                            Metadata: {
                                // this asset path does not exist
                                'aws:asset:path': 'MyNestedStack.template.json',
                                'aws:cdk:path':
                                    'test-stack/MyNestedStack.NestedStack/MyNestedStack.NestedStackResource',
                            },
                        },
                    },
                }),
                [manifestFile]: JSON.stringify({
                    version: '17.0.0',
                    artifacts: {
                        'test-stack.assets': {
                            type: 'cdk:asset-manifest',
                            properties: {
                                file: 'test-stack.assets.json',
                            },
                        },
                        Tree: {
                            type: 'cdk:tree',
                            properties: {
                                file: 'tree.json',
                            },
                        },
                        'test-stack': {
                            type: 'aws:cloudformation:stack',
                            environment: 'aws://unknown-account/unknown-region',
                            properties: {
                                templateFile: 'test-stack.template.json',
                                validateOnSynth: false,
                            },
                            metadata: {
                                '/test-stack/MyNestedStack.NestedStack/MyNestedStack.NestedStackResource': [
                                    {
                                        type: 'aws:cdk:logicalId',
                                        data: 'MyNestedStack',
                                    },
                                ],
                            },
                            displayName: 'test-stack',
                        },
                    },
                }),
            });

            expect(() => {
                AssemblyManifestReader.fromDirectory(path.dirname(manifestFile));
            }).toThrow(
                /Failed to read CloudFormation template at path: \/tmp\/foo\/bar\/does\/not\/exist\/MyNestedStack.template.json/,
            );
        });
    });
});
