import * as path from 'path';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { setMocks, testApp } from './mocks';
import { MockResourceArgs } from '@pulumi/pulumi/runtime';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';

describe('Synthesizer', () => {
    test('no assets = no staging resources', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources);

        await testApp((scope) => {
            new CfnBucket(scope, 'Bucket');
        });
        expect(resources).toEqual([
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
                    name: 'pulumi-cdk-staging-bucket',
                    type: 'aws:s3/bucketV2:BucketV2',
                }),
                expect.objectContaining({
                    name: 'staging-bucket-versioning',
                    type: 'aws:s3/bucketVersioningV2:BucketVersioningV2',
                }),
                expect.objectContaining({
                    name: 'staging-bucket-encryption',
                    type: 'aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2',
                }),
                expect.objectContaining({
                    name: 'staging-bucket-policy',
                    type: 'aws:s3/bucketPolicy:BucketPolicy',
                }),
                expect.objectContaining({
                    name: 'staging-bucket-lifecycle',
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
});
