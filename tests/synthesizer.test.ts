import * as path from 'path';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { setMocks, testApp } from './mocks';
import { MockResourceArgs } from '@pulumi/pulumi/runtime';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { asNetworkMode, asPlatforms } from '../src/synthesizer';
import { NetworkMode, Platform as DockerPlatform } from '@pulumi/docker-build';
import { DockerImageAsset, Platform, NetworkMode as Network } from 'aws-cdk-lib/aws-ecr-assets';

beforeAll(() => {
    process.env.AWS_REGION = 'us-east-2';
});
afterAll(() => {
    process.env.AWS_REGION = undefined;
});

describe('Synthesizer File Assets', () => {
    test('no assets = no staging resources', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources);

        await testApp((scope) => {
            new CfnBucket(scope, 'Bucket');
        });
        expect(resources).toEqual([
            expect.objectContaining({
                inputs: {
                    autoNaming: '{"randomSuffixMinLength":7,"autoTrim":true}',
                    region: 'us-east-2',
                    skipCredentialsValidation: 'true',
                    skipGetEc2Platforms: 'true',
                    skipMetadataApiCheck: 'true',
                    skipRegionValidation: 'true',
                },
                name: 'cdk-aws-native',
                provider: '',
                type: 'pulumi:providers:aws-native',
            }),
            expect.objectContaining({
                name: 'staging-stack-project-stack',
                type: 'cdk:construct:StagingStack',
            }),
            expect.objectContaining({
                name: 'bucket',
                type: 'aws-native:s3:Bucket',
            }),
        ]);
    });

    test('assets = staging resources created', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources);

        await testApp((scope) => {
            new CfnBucket(scope, 'Bucket');
            new Asset(scope, 'asset', {
                path: path.join(__dirname, 'synthesizer.test.ts'),
            });
        });
        expect(resources).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'staging-stack-project-stack',
                    type: 'cdk:construct:StagingStack',
                }),
                expect.objectContaining({
                    name: 'pulumi-cdk-project-stack-staging',
                    type: 'aws:s3/bucketV2:BucketV2',
                }),
                expect.objectContaining({
                    name: 'pulumi-cdk-project-stack-staging-versioning',
                    type: 'aws:s3/bucketVersioningV2:BucketVersioningV2',
                }),
                expect.objectContaining({
                    name: 'pulumi-cdk-project-stack-staging-encryption',
                    type: 'aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2',
                }),
                expect.objectContaining({
                    name: 'pulumi-cdk-project-stack-staging-policy',
                    type: 'aws:s3/bucketPolicy:BucketPolicy',
                }),
                expect.objectContaining({
                    name: 'pulumi-cdk-project-stack-staging-lifecycle',
                    type: 'aws:s3/bucketLifecycleConfigurationV2:BucketLifecycleConfigurationV2',
                }),
                expect.objectContaining({
                    type: 'aws:s3/bucketObjectv2:BucketObjectv2',
                    inputs: expect.objectContaining({
                        key: expect.not.stringMatching(/^deploy-time\/*/),
                    }),
                }),
            ]),
        );
    });

    test('deploy time assets', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources);

        await testApp((scope) => {
            new CfnBucket(scope, 'Bucket');
            new Asset(scope, 'deploy-time-asset', {
                deployTime: true,
                path: path.join(__dirname, 'synthesizer.test.ts'),
            });
        });
        expect(resources).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'aws:s3/bucketObjectv2:BucketObjectv2',
                    inputs: expect.objectContaining({
                        key: expect.stringMatching(/^deploy-time\/*/),
                    }),
                }),
            ]),
        );
    });

    test('asNetworkMode works', () => {
        expect(asNetworkMode('host')).toEqual(NetworkMode.Host);
    });

    test('asNetworkMode throws', () => {
        expect(() => {
            asNetworkMode('abc');
        }).toThrow(/Unsupported network mode: abc/);
    });

    test('asPlatforms works', () => {
        expect(asPlatforms('linux/amd64')).toEqual([DockerPlatform.Linux_amd64]);
    });

    test('asPlatforms throws', () => {
        expect(() => {
            asPlatforms('abc');
        }).toThrow(/Unsupported platform: abc/);
    });
});

describe('Synthesizer Docker Assets', () => {
    test('basic', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources);

        await testApp((scope) => {
            new CfnBucket(scope, 'Bucket');
            new DockerImageAsset(scope, 'asset', {
                directory: path.join(__dirname, 'test-data', 'app'),
                assetName: 'test-asset',
            });
        });

        expect(resources).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'staging-stack-project-stack',
                    type: 'cdk:construct:StagingStack',
                }),
                expect.objectContaining({
                    name: 'project-stack/test-asset',
                    type: 'aws:ecr/repository:Repository',
                }),
                expect.objectContaining({
                    name: 'lifecycle-policy',
                    type: 'aws:ecr/lifecyclePolicy:LifecyclePolicy',
                }),
                expect.objectContaining({
                    name: 'staging-stack-project-stack/test-asset',
                    type: 'docker-build:index:Image',
                    inputs: {
                        buildOnPreview: true,
                        context: {
                            location: expect.stringMatching(/.*\/asset.[a-z0-9]+$/),
                        },
                        dockerfile: {
                            location: expect.stringMatching(/.*\/asset.[a-z0-9]+\/Dockerfile$/),
                        },
                        network: 'default',
                        push: true,
                        registries: [
                            {
                                address: 'https://12345678910.dkr.ecr.us-east-1.amazonaws.com',
                                password: 'password',
                                username: 'user',
                            },
                        ],
                        tags: [
                            expect.stringMatching(
                                /^12345678910.dkr.ecr.us-east-1.amazonaws.com\/project-stack\/test-asset:[a-z0-9]+/,
                            ),
                        ],
                    },
                }),
            ]),
        );
    });

    test('all configs', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources);

        await testApp((scope) => {
            new CfnBucket(scope, 'Bucket');
            new DockerImageAsset(scope, 'asset', {
                directory: path.join(__dirname, 'test-data'),
                assetName: 'test-asset',
                file: 'app/Dockerfile',
                target: 'target',
                cacheTo: {
                    type: 'registry',
                    params: {
                        ref: '12345678910.dkr.ecr.us-east-1.amazonaws.com/project-stack/test-asset:cache',
                    },
                },
                outputs: ['output'],
                buildSsh: 'ssh',
                platform: Platform.LINUX_AMD64,
                cacheFrom: [
                    {
                        type: 'inline',
                        params: {},
                    },
                ],
                buildArgs: {
                    key: 'value',
                },
                networkMode: Network.HOST,
                buildSecrets: {
                    secret: 'value',
                },
            });
        });

        expect(resources).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'staging-stack-project-stack',
                    type: 'cdk:construct:StagingStack',
                }),
                expect.objectContaining({
                    name: 'project-stack/test-asset',
                    type: 'aws:ecr/repository:Repository',
                }),
                expect.objectContaining({
                    name: 'lifecycle-policy',
                    type: 'aws:ecr/lifecyclePolicy:LifecyclePolicy',
                }),
                expect.objectContaining({
                    name: 'staging-stack-project-stack/test-asset',
                    type: 'docker-build:index:Image',
                    inputs: {
                        buildArgs: {
                            key: 'value',
                        },
                        buildOnPreview: true,
                        cacheFrom: [
                            {
                                inline: {},
                            },
                        ],
                        cacheTo: [
                            {
                                registry: {
                                    ref: '12345678910.dkr.ecr.us-east-1.amazonaws.com/project-stack/test-asset:cache',
                                },
                            },
                        ],
                        context: {
                            location: expect.stringMatching(/.*\/asset.[a-z0-9]+$/),
                        },
                        dockerfile: {
                            location: expect.stringMatching(/.*\/asset.[a-z0-9]+\/app\/Dockerfile$/),
                        },
                        network: 'host',
                        platforms: ['linux/amd64'],
                        push: true,
                        registries: [
                            {
                                address: 'https://12345678910.dkr.ecr.us-east-1.amazonaws.com',
                                password: 'password',
                                username: 'user',
                            },
                        ],
                        secrets: {
                            secret: 'value',
                        },
                        ssh: [
                            {
                                id: 'default',
                                paths: ['ssh'],
                            },
                        ],
                        tags: [
                            expect.stringMatching(
                                /^12345678910.dkr.ecr.us-east-1.amazonaws.com\/project-stack\/test-asset:[a-z0-9]+/,
                            ),
                        ],
                        target: 'target',
                    },
                }),
            ]),
        );
    });

    test('images are deduplicated', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources);

        await testApp((scope) => {
            new CfnBucket(scope, 'Bucket');
            new DockerImageAsset(scope, 'asset', {
                directory: path.join(__dirname, 'test-data', 'app'),
                assetName: 'test-asset',
            });
            new DockerImageAsset(scope, 'asset2', {
                directory: path.join(__dirname, 'test-data', 'app'),
                assetName: 'test-asset',
            });
        });
        const images = resources.filter((r) => r.type === 'docker-build:index:Image');
        expect(images.length).toEqual(1);
    });

    test('images with different assetNames are not deduplicated', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources);

        await testApp((scope) => {
            new CfnBucket(scope, 'Bucket');
            new DockerImageAsset(scope, 'asset', {
                directory: path.join(__dirname, 'test-data', 'app'),
                assetName: 'test-asset',
            });
            new DockerImageAsset(scope, 'asset2', {
                directory: path.join(__dirname, 'test-data', 'app'),
                assetName: 'test-asset-2',
            });
        });
        const images = resources.filter((r) => r.type === 'docker-build:index:Image');
        expect(images.length).toEqual(2);
    });
});
