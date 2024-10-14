import { AppConverter, StackConverter } from '../../src/converters/app-converter';
import { Stack } from 'aws-cdk-lib/core';
import { StackComponentResource, StackOptions } from '../../src/types';
import * as path from 'path';
import * as mockfs from 'mock-fs';
import * as pulumi from '@pulumi/pulumi';
import { BucketPolicy } from '@pulumi/aws-native/s3';
import { createStackManifest } from '../utils';
import { promiseOf, setMocks } from '../mocks';
import { CdkConstruct } from '../../src/interop';

class MockStackComponent extends StackComponentResource {
    public readonly name = 'stack';
    public readonly assemblyDir: string;
    public stack: Stack;
    public options?: StackOptions | undefined;
    public dependencies: CdkConstruct[] = [];
    constructor(dir: string) {
        super('stack');
        this.assemblyDir = dir;
        this.registerOutputs();
    }

    registerOutput(outputId: string, output: any): void {}
}

beforeAll(() => {
    setMocks();
});

describe('App Converter', () => {
    const manifestFile = '/tmp/foo/bar/does/not/exist/manifest.json';
    const manifestStack = '/tmp/foo/bar/does/not/exist/test-stack.template.json';
    const manifestTree = '/tmp/foo/bar/does/not/exist/tree.json';
    const manifestAssets = '/tmp/foo/bar/does/not/exist/test-stack.assets.json';
    beforeEach(() => {
        mockfs({
            // Recursively loads all node_modules
            node_modules: mockfs.load(path.resolve(__dirname, '../../node_modules')),
            [manifestAssets]: JSON.stringify({
                version: '36.0.0',
                files: {
                    abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44: {
                        source: {
                            path: 'asset.abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44',
                            packaging: 'file',
                        },
                        destinations: {
                            'current_account-current_region': {
                                bucketName: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                                objectKey: 'abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44',
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
                                'example-bucket': {
                                    id: 'example-bucket',
                                    path: 'test-stack/example-bucket',
                                    children: {
                                        Resource: {
                                            id: 'Resource',
                                            path: 'test-stack/example-bucket/Resource',
                                            attributes: {
                                                'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                                            },
                                            constructInfo: {
                                                fqn: 'aws-cdk-lib.aws_s3.CfnBucket',
                                                version: '2.149.0',
                                            },
                                        },
                                        Policy: {
                                            id: 'Policy',
                                            path: 'test-stack/example-bucket/Policy',
                                            children: {
                                                Resource: {
                                                    id: 'Resource',
                                                    path: 'test-stack/example-bucket/Policy/Resource',
                                                    attributes: {
                                                        'aws:cdk:cloudformation:type': 'AWS::S3::BucketPolicy',
                                                    },
                                                    constructInfo: {
                                                        fqn: 'aws-cdk-lib.aws_s3.CfnBucketPolicy',
                                                        version: '2.149.0',
                                                    },
                                                },
                                            },
                                            constructInfo: {
                                                fqn: 'aws-cdk-lib.aws_s3.BucketPolicy',
                                                version: '2.149.0',
                                            },
                                        },
                                    },
                                    constructInfo: {
                                        fqn: 'aws-cdk-lib.aws_s3.Bucket',
                                        version: '2.149.0',
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            [manifestStack]: JSON.stringify({
                Resources: {
                    examplebucketC9DFA43E: {
                        Type: 'AWS::S3::Bucket',
                        Properties: {},
                    },
                    examplebucketPolicyE09B485E: {
                        Type: 'AWS::S3::BucketPolicy',
                        Properties: {
                            Bucket: {
                                Ref: 'examplebucketC9DFA43E',
                            },
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
                            '/test-stack/example-bucket/Resource': [
                                {
                                    type: 'aws:cdk:logicalId',
                                    data: 'examplebucketC9DFA43E',
                                },
                            ],
                            '/test-stack/example-bucket/Policy/Resource': [
                                {
                                    type: 'aws:cdk:logicalId',
                                    data: 'examplebucketPolicyE09B485E',
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
    test('can convert', async () => {
        const mockStackComponent = new MockStackComponent('/tmp/foo/bar/does/not/exist');
        const converter = new AppConverter(mockStackComponent);
        converter.convert();
        const stacks = Array.from(converter.stacks.values());

        const resourceMap: { [key: string]: pulumi.Resource } = {};
        const urnPromises = stacks.flatMap((stack) => {
            const resources = Array.from(stack.resources.values());
            resources.forEach((res) => (resourceMap[res.resourceType] = res.resource));
            return resources.flatMap((res) => promiseOf(res.resource.urn));
        });
        const urns = await Promise.all(urnPromises);
        expect(urns).toEqual([
            createUrn('Bucket', 'examplebucketc9dfa43e'),
            createUrn('BucketPolicy', 'examplebucketPolicyE09B485E'),
        ]);
        const bucket = resourceMap['AWS::S3::BucketPolicy'] as BucketPolicy;
        const bucketName = await promiseOf(bucket.bucket);
        expect(bucketName).toEqual('examplebucketc9dfa43e_id');
    });

    test.each([
        ['ref', createStackManifest({ Bucket: { Ref: 'resource1' } }), 'resource1_id'],
        [
            'GetAtt',
            createStackManifest({
                Bucket: { 'Fn::GetAtt': ['resource1', 'Arn'] },
            }),
            'resource1_arn',
        ],
        [
            'Join-Ref',
            createStackManifest({
                Bucket: { 'Fn::Join': ['', ['arn:', { Ref: 'resource1' }]] },
            }),
            'arn:resource1_id',
        ],
        [
            'Split-Select-Ref',
            createStackManifest({
                Bucket: { 'Fn::Select': ['1', { 'Fn::Split': ['_', { Ref: 'resource1' }] }] },
            }),
            'id',
        ],
        [
            'Base64-Ref',
            createStackManifest({
                Bucket: { 'Fn::Base64': { Ref: 'resource1' } },
            }),
            Buffer.from('resource1_id').toString('base64'),
        ],
        [
            'GetAZs-Select-Ref',
            createStackManifest({
                Bucket: { 'Fn::Select': ['1', { 'Fn::GetAZs': 'us-east-1' }] },
            }),
            'us-east-1b',
        ],
        [
            'Sub-Ref',
            createStackManifest({
                Bucket: { 'Fn::Sub': 'www.${resource1}-${AWS::Region}-${AWS::AccountId}' },
            }),
            'www.resource1_id-us-east-2-12345678910',
        ],
    ])(
        'intrinsics %s',
        async (_name, stackManifest, expected) => {
            const mockStackComponent = new MockStackComponent('/tmp/foo/bar/does/not/exist');
            const converter = new StackConverter(mockStackComponent, stackManifest);
            converter.convert(new Set());
            const promises = Array.from(converter.resources.values()).flatMap((res) => promiseOf(res.resource.urn));
            await Promise.all(promises);
            const bucket = converter.resources.get('resource1');
            expect(bucket).toBeDefined();
            const policy = converter.resources.get('resource2');
            expect(policy).toBeDefined();
            const policyResource = policy!.resource as BucketPolicy;
            const policyBucket = await promiseOf(policyResource.bucket);
            expect(policyBucket).toEqual(expected);
        },
        10_000,
    );
});

function createUrn(resource: string, logicalId: string): string {
    return `urn:pulumi:stack::project::cdk:construct:aws-cdk-lib/aws_s3:${resource}$aws-native:s3:${resource}::${logicalId}`;
}
