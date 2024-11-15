import { AppConverter, StackConverter } from '../../src/converters/app-converter';
import * as native from '@pulumi/aws-native';
import * as fs from 'fs';
import * as path from 'path';
import * as mockfs from 'mock-fs';
import * as pulumi from '@pulumi/pulumi';
import { BucketPolicy } from '@pulumi/aws-native/s3';
import { createStackManifest } from '../utils';
import { promiseOf, setMocks, MockAppComponent, MockSynth } from '../mocks';
import { StackManifest, StackManifestProps } from '../../src/assembly';
import { MockResourceArgs } from '@pulumi/pulumi/runtime';
import { Stack as CdkStack } from 'aws-cdk-lib/core';

let resources: MockResourceArgs[] = [];
beforeAll(() => {
    resources = [];
    setMocks(resources);
});

describe('App Converter', () => {
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
                            PolicyDocument: {},
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
    test('can convert app', async () => {
        const mockStackComponent = new MockAppComponent('/tmp/foo/bar/does/not/exist');
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
        ['ref', createStackManifest({ resource2Props: { Bucket: { Ref: 'resource1' } } }), 'resource1_id', undefined],
        [
            'GetAtt',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::GetAtt': ['resource1', 'Arn'] },
                },
            }),
            'resource1_arn',
            undefined,
        ],
        [
            'Join-Ref',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::Join': ['', ['arn:', { Ref: 'resource1' }]] },
                },
            }),
            'arn:resource1_id',
            undefined,
        ],
        [
            'Split-Select-Ref',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::Select': ['1', { 'Fn::Split': ['_', { Ref: 'resource1' }] }] },
                },
            }),
            'id',
            undefined,
        ],
        [
            'Base64-Ref',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::Base64': { Ref: 'resource1' } },
                },
            }),
            Buffer.from('resource1_id').toString('base64'),
            undefined,
        ],
        [
            'GetAZs-Select-Ref',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::Select': ['1', { 'Fn::GetAZs': 'us-east-1' }] },
                },
            }),
            'us-east-1b',
            undefined,
        ],
        [
            'Sub-Ref',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::Sub': 'www.${resource1}-${AWS::Region}-${AWS::AccountId}' },
                },
            }),
            'www.resource1_id-us-east-2-12345678910',
            undefined,
        ],
        [
            'FindInMap',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::FindInMap': ['Map', 'Key', 'Value'] },
                },
                mappings: {
                    Map: {
                        Key: {
                            Value: 'result',
                        },
                    },
                },
            }),
            'result',
            undefined,
        ],
        [
            'FindInMap-Ref',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::FindInMap': ['Map', { Ref: 'AWS::Region' }, 'Value'] },
                },
                mappings: {
                    Map: {
                        ['us-east-2']: {
                            Value: 'result',
                        },
                    },
                },
            }),
            'result',
            undefined,
        ],
        [
            'Split-FindInMap-Ref',
            createStackManifest({
                resource2Props: {
                    Bucket: {
                        'Fn::Select': [
                            '1',
                            {
                                'Fn::Split': [
                                    ',',
                                    {
                                        'Fn::FindInMap': ['Map', { Ref: 'AWS::Region' }, 'Value'],
                                    },
                                ],
                            },
                        ],
                    },
                },
                mappings: {
                    Map: {
                        ['us-east-2']: {
                            Value: 'result1,result2',
                        },
                    },
                },
            }),
            'result2',
            undefined,
        ],
        [
            'FindInMap-id-error',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::FindInMap': ['Map', 'Key', 'Value'] },
                },
                mappings: {
                    OtherMap: {
                        Key: {
                            Value: 'result',
                        },
                    },
                },
            }),
            'result',
            'Mapping Map not found in mappings. Available mappings are OtherMap',
        ],
        [
            'FindInMap-mappings-error',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::FindInMap': ['Map', 'Key', 'Value'] },
                },
            }),
            'result',
            'No mappings found in stack',
        ],
        [
            'FindInMap-mappings-input-error',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::FindInMap': ['Map', 'Value'] },
                },
            }),
            'result',
            'Fn::FindInMap requires exactly 3 parameters, got 2',
        ],
        [
            'FindInMap-topLevel-error',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::FindInMap': ['Map', 'OtherKey', 'Value'] },
                },
                mappings: {
                    Map: {
                        Key: {
                            Value: 'result',
                        },
                    },
                },
            }),
            'result',
            'Key OtherKey not found in mapping Map. Available keys are Key',
        ],
        [
            'FindInMap-secondLevel-error',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::FindInMap': ['Map', 'Key', 'OtherValue'] },
                },
                mappings: {
                    Map: {
                        Key: {
                            Value: 'result',
                        },
                    },
                },
            }),
            'result',
            'Key OtherValue not found in mapping Map.Key. Available keys are Value',
        ],
    ])(
        'intrinsics %s',
        async (_name, stackManifest, expected, expectedError) => {
            const mockStackComponent = new MockAppComponent('/tmp/foo/bar/does/not/exist');
            const converter = new StackConverter(mockStackComponent, stackManifest);
            if (expectedError) {
                expect(() => {
                    converter.convert(new Set());
                }).toThrow(expectedError);
            } else {
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
            }
        },
        10_000,
    );
});

describe('Stack Converter', () => {
    test('can convert', async () => {
        const manifest = new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/vpc': 'vpc',
                'stack/cidr': 'cidr',
                'stack/other': 'other',
            },
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    vpc: {
                        id: 'vpc',
                        path: 'stack/vpc',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::EC2::VPC',
                        },
                    },
                    cidr: {
                        id: 'cidr',
                        path: 'stack/cidr',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::EC2::VPCCidrBlock',
                        },
                    },
                    other: {
                        id: 'other',
                        path: 'stack/other',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::EC2::Subnet',
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
                    vpc: {
                        Type: 'AWS::EC2::VPC',
                        Properties: {},
                    },
                    cidr: {
                        Type: 'AWS::EC2::VPCCidrBlock',
                        Properties: {
                            VpcId: { Ref: 'vpc' },
                            Ipv6CidrBlock: 'cidr_ipv6AddressAttribute',
                        },
                    },
                    other: {
                        Type: 'AWS::EC2::Subnet',
                        Properties: {
                            VpcId: { Ref: 'vpc' },
                            Ipv6CidrBlock: { 'Fn::Select': [0, { 'Fn::GetAtt': ['vpc', 'Ipv6CidrBlocks'] }] },
                        },
                    },
                },
            },
            dependencies: [],
        });
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);
        converter.convert(new Set());
        const subnet = converter.resources.get('other')?.resource as native.ec2.Subnet;
        const cidrBlock = await promiseOf(subnet.ipv6CidrBlock);
        expect(cidrBlock).toEqual('cidr_ipv6AddressAttribute');
    });

    test('can convert multiple', async () => {
        const manifest = new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/vpc': 'vpc',
                'stack/cidr': 'cidr',
                'stack/other': 'other',
                'stack/vpc2': 'vpc2',
                'stack/cidr2': 'cidr2',
                'stack/other2': 'other2',
            },
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    vpc: {
                        id: 'vpc',
                        path: 'stack/vpc',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::EC2::VPC',
                        },
                    },
                    cidr: {
                        id: 'cidr',
                        path: 'stack/cidr',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::EC2::VPCCidrBlock',
                        },
                    },
                    other: {
                        id: 'other',
                        path: 'stack/other',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::EC2::Subnet',
                        },
                    },
                    vpc2: {
                        id: 'vpc2',
                        path: 'stack/vpc2',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::EC2::VPC',
                        },
                    },
                    cidr2: {
                        id: 'cidr2',
                        path: 'stack/cidr2',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::EC2::VPCCidrBlock',
                        },
                    },
                    other2: {
                        id: 'other2',
                        path: 'stack/other2',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::EC2::Subnet',
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
                    vpc: {
                        Type: 'AWS::EC2::VPC',
                        Properties: {},
                    },
                    cidr: {
                        Type: 'AWS::EC2::VPCCidrBlock',
                        Properties: {
                            VpcId: { Ref: 'vpc' },
                            Ipv6CidrBlock: 'cidr_ipv6AddressAttribute',
                        },
                    },
                    other: {
                        Type: 'AWS::EC2::Subnet',
                        Properties: {
                            VpcId: { Ref: 'vpc' },
                            Ipv6CidrBlock: { 'Fn::Select': [0, { 'Fn::GetAtt': ['vpc', 'Ipv6CidrBlocks'] }] },
                        },
                    },
                    vpc2: {
                        Type: 'AWS::EC2::VPC',
                        Properties: {},
                    },
                    cidr2: {
                        Type: 'AWS::EC2::VPCCidrBlock',
                        Properties: {
                            VpcId: { Ref: 'vpc2' },
                            Ipv6CidrBlock: 'cidr_ipv6AddressAttribute_2',
                        },
                    },
                    other2: {
                        Type: 'AWS::EC2::Subnet',
                        Properties: {
                            VpcId: { Ref: 'vpc2' },
                            Ipv6CidrBlock: { 'Fn::Select': [0, { 'Fn::GetAtt': ['vpc2', 'Ipv6CidrBlocks'] }] },
                        },
                    },
                },
            },
            dependencies: [],
        });
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);
        converter.convert(new Set());
        const subnet = converter.resources.get('other')?.resource as native.ec2.Subnet;
        const cidrBlock = await promiseOf(subnet.ipv6CidrBlock);
        expect(cidrBlock).toEqual('cidr_ipv6AddressAttribute');
        const subnet2 = converter.resources.get('other2')?.resource as native.ec2.Subnet;
        const cidrBlock2 = await promiseOf(subnet2.ipv6CidrBlock);
        expect(cidrBlock2).toEqual('cidr_ipv6AddressAttribute_2');
    });

    test('can convert with custom resources', async () => {
        const stackManifestPath = path.join(__dirname, '../test-data/custom-resource-stack/stack-manifest.json');
        const props: StackManifestProps = JSON.parse(fs.readFileSync(stackManifestPath, 'utf-8'));
        const manifest = new StackManifest(props);
        const app = new MockAppComponent('/tmp/foo/bar/does/not/exist');
        const stagingBucket = 'my-bucket';
        const customResourcePrefix = 'my-prefix';
        app.stacks[manifest.id] = {
            synthesizer: new MockSynth(stagingBucket, customResourcePrefix),
            node: {
                id: 'my-stack',
            },
        } as unknown as CdkStack;

        const converter = new StackConverter(app, manifest);
        converter.convert(new Set());

        const customResource = converter.resources.get('DeployWebsiteCustomResourceD116527B');
        expect(customResource).toBeDefined();

        const customResourceEmulator = customResource!.resource! as native.cloudformation.CustomResourceEmulator;
        expect(customResourceEmulator.bucket).toBeDefined();
        expect(customResourceEmulator.data).toBeDefined();
        expect(customResourceEmulator.serviceToken).toBeDefined();

        // This uses GetAtt to get the destination bucket from the custom resource
        const customResourceRole = converter.resources.get('CustomResourceRoleAB1EF463');
        expect(customResourceRole).toBeDefined();
    });
});

function createUrn(resource: string, logicalId: string): string {
    return `urn:pulumi:stack::project::cdk:construct:aws-cdk-lib/aws_s3:${resource}$aws-native:s3:${resource}::${logicalId}`;
}
