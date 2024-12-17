import { AppConverter, StackConverter } from '../../src/converters/app-converter';
import * as native from '@pulumi/aws-native';
import * as fs from 'fs';
import * as path from 'path';
import * as mockfs from 'mock-fs';
import * as pulumi from '@pulumi/pulumi';
import { BucketPolicy } from '@pulumi/aws-native/s3';
import { Policy } from '@pulumi/aws/iam'
import { createStackManifest } from '../utils';
import { promiseOf, setMocks, MockAppComponent, MockSynth } from '../mocks';
import { StackManifest, StackManifestProps } from '../../src/assembly';
import { MockResourceArgs } from '@pulumi/pulumi/runtime';
import { Stack as CdkStack } from 'aws-cdk-lib/core';
import { NestedStackConstruct } from '../../src/interop';

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
        expect(bucketName).toEqual('examplebucketc9dfa43e_name');
    });

    test.each([
        ['ref', createStackManifest({ resource2Props: { Bucket: { Ref: 'resource1' } } }), 'resource1_name', undefined],
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
            'arn:resource1_name',
            undefined,
        ],
        [
            'Split-Select-Ref',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::Select': ['1', { 'Fn::Split': ['_', { Ref: 'resource1' }] }] },
                },
            }),
            'name',
            undefined,
        ],
        [
            'Base64-Ref',
            createStackManifest({
                resource2Props: {
                    Bucket: { 'Fn::Base64': { Ref: 'resource1' } },
                },
            }),
            Buffer.from('resource1_name').toString('base64'),
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
            'www.resource1_name-us-east-2-12345678910',
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
            'Mapping Map not found in mappings of stack stack. Available mappings are OtherMap',
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
                const bucket = converter.resources.get({ stackPath: stackManifest.id, id: 'resource1' });
                expect(bucket).toBeDefined();
                const policy = converter.resources.get({ stackPath: stackManifest.id, id: 'resource2' });
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
                'stack/vpc': { stackPath: 'stack', id: 'vpc' },
                'stack/cidr': { stackPath: 'stack', id: 'cidr' },
                'stack/other': { stackPath: 'stack', id: 'other' },
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
            nestedStacks: {},
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
        const subnet = converter.resources.get({ stackPath: manifest.id, id: 'other' })?.resource as native.ec2.Subnet;
        const cidrBlock = await promiseOf(subnet.ipv6CidrBlock);
        expect(cidrBlock).toEqual('cidr_ipv6AddressAttribute');
    });

    test('can convert multiple', async () => {
        const manifest = new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/vpc': { stackPath: 'stack', id: 'vpc' },
                'stack/cidr': { stackPath: 'stack', id: 'cidr' },
                'stack/other': { stackPath: 'stack', id: 'other' },
                'stack/vpc2': { stackPath: 'stack', id: 'vpc2' },
                'stack/cidr2': { stackPath: 'stack', id: 'cidr2' },
                'stack/other2': { stackPath: 'stack', id: 'other2' },
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
            nestedStacks: {},
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
        const subnet = converter.resources.get({ stackPath: manifest.id, id: 'other' })?.resource as native.ec2.Subnet;
        const cidrBlock = await promiseOf(subnet.ipv6CidrBlock);
        expect(cidrBlock).toEqual('cidr_ipv6AddressAttribute');
        const subnet2 = converter.resources.get({ stackPath: manifest.id, id: 'other2' })?.resource as native.ec2.Subnet;
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

        const customResource = converter.resources.get({ stackPath: manifest.id, id: 'DeployWebsiteCustomResourceD116527B' });
        expect(customResource).toBeDefined();

        const customResourceEmulator = customResource!.resource! as native.cloudformation.CustomResourceEmulator;
        expect(customResourceEmulator.bucket).toBeDefined();
        expect(customResourceEmulator.data).toBeDefined();
        expect(customResourceEmulator.serviceToken).toBeDefined();

        // This uses GetAtt to get the destination bucket from the custom resource
        const customResourceRole = converter.resources.get({ stackPath: manifest.id, id: 'CustomResourceRoleAB1EF463' });
        expect(customResourceRole).toBeDefined();
    });

    test('can convert nested stacks', async () => {
        const stackManifestPath = path.join(__dirname, '../test-data/nested-stack/stack-manifest.json');
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

        const rootBucket = converter.resources.get({ stackPath: manifest.id, id: 'bucket' })?.resource as native.s3.Bucket;
        expect(rootBucket).toBeDefined();
        const rootBucketName = await promiseOf(rootBucket.bucketName);

        // nested stack resource should be mapped
        const nestedStackResource = converter.resources.get({ stackPath: manifest.id, id: 'nestyNestedStacknestyNestedStackResource' });
        expect(nestedStackResource).toBeDefined();
        expect(nestedStackResource?.resourceType).toEqual('AWS::CloudFormation::Stack');
        expect(NestedStackConstruct.isNestedStackConstruct(nestedStackResource?.resource)).toBeTruthy();

        // resources of the nested stack should be mapped
        // this tests that properties are correctly passed to the nested stack
        const nestedBucket = converter.resources.get({ stackPath: `${manifest.id}/nesty`, id: 'bucket43879C71' })?.resource as native.s3.Bucket;
        expect(nestedBucket).toBeDefined();
        const nestedBucketName = await promiseOf(nestedBucket.bucketName);
        expect(nestedBucketName).toEqual(`${rootBucketName}-nested`);


        const policy = converter.resources.get({ stackPath: manifest.id, id: 'CustomCDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756CServiceRoleDefaultPolicy' })?.resource as Policy;
        const policyDocument = await promiseOf(policy.policy) as any;
        expect(policyDocument.Statement[1].Resource).toEqual(expect.arrayContaining(['bucket43879c71_arn', 'bucket43879c71_arn/*']));
    });

    describe('asOutputValue', () => {
        test('can convert tokens to outputs', async () => {
            const manifest = new StackManifest({
                id: 'stack',
                templatePath: 'test/stack',
                metadata: {
                    'stack/vpc': { stackPath: 'stack', id: 'vpc' },
                    'stack/cidr': { stackPath: 'stack', id: 'cidr' },
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
                    },
                    constructInfo: {
                        fqn: 'aws-cdk-lib.Stack',
                        version: '2.149.0',
                    },
                },
                nestedStacks: {},
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
                    },
                },
                dependencies: [],
            });
    
            const app = new MockAppComponent('/tmp/foo/bar/does/not/exist');
            const stagingBucket = 'my-bucket';
            const customResourcePrefix = 'my-prefix';
            app.stacks[manifest.id] = {
                synthesizer: new MockSynth(stagingBucket, customResourcePrefix),
                node: {
                    id: 'my-stack',
                },
                resolve: (obj: any) => ({ Ref: 'vpc' }),
            } as unknown as CdkStack;
            const converter = new StackConverter(app, manifest);
            converter.convert(new Set());
    
            const result = await promiseOf(converter.asOutputValue("DUMMY") as any);
            expect(result).toEqual("vpc_id");
        });
    
        test('throws if token is not found in any stack', async () => {
            const manifest = new StackManifest({
                id: 'stack',
                templatePath: 'test/stack',
                metadata: {
                    'stack/vpc': { stackPath: 'stack', id: 'vpc' },
                    'stack/cidr': { stackPath: 'stack', id: 'cidr' },
                    'stack/nested.NestedStack/nested.NestedStackResource': { stackPath: 'stack', id: 'nested.NestedStackResource' },
                    'stack/nested/vpc': { stackPath: 'stack/nested', id: 'vpc' },
                    'stack/nested/cidr': { stackPath: 'stack/nested', id: 'cidr' },
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
                        nested: {
                            id: 'nested',
                            path: 'stack/nested',
                            children: {
                                vpc: {
                                    id: 'vpc',
                                    path: 'stack/nested/vpc',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPC',
                                    },
                                },
                                cidr: {
                                    id: 'cidr',
                                    path: 'stack/nested/cidr',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPCCidrBlock',
                                    },
                                },
                            },
                        },
                        "nested.NestedStack": {
                            id: 'nested.NestedStack',
                            path: 'stack/nested.NestedStack',
                            children: {
                                'nested.NestedStackResource': {
                                    id: 'nested.NestedStackResource',
                                    path: 'stack/nested.NestedStack/nested.NestedStackResource',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::CloudFormation::Stack',
                                    },
                                },
                            }
                        },
                    },
                    constructInfo: {
                        fqn: 'aws-cdk-lib.Stack',
                        version: '2.149.0',
                    },
                },
                nestedStacks: {
                    'stack/nested': {
                        logicalId: 'nested',
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
                        },
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
                        "nested.NestedStackResource": {
                            Type: 'AWS::CloudFormation::Stack',
                            Properties: {},
                        },
                    },
                },
                dependencies: [],
            });
    
            const app = new MockAppComponent('/tmp/foo/bar/does/not/exist');
            const stagingBucket = 'my-bucket';
            const customResourcePrefix = 'my-prefix';
            app.stacks[manifest.id] = {
                synthesizer: new MockSynth(stagingBucket, customResourcePrefix),
                node: {
                    id: 'my-stack',
                },
                resolve: (obj: any) => ({ Ref: 'not-found' }),
            } as unknown as CdkStack;
            const converter = new StackConverter(app, manifest);
            converter.convert(new Set());
    
            expect(() => converter.asOutputValue("DUMMY")).toThrow("Ref intrinsic unable to resolve not-found in stack stack: not a known logical resource or parameter reference");
        });
    
        test('finds value in correct nested stack', async () => {
            const manifest = new StackManifest({
                id: 'stack',
                templatePath: 'test/stack',
                metadata: {
                    'stack/vpc': { stackPath: 'stack', id: 'vpc' },
                    'stack/cidr': { stackPath: 'stack', id: 'cidr' },
                    'stack/nested.NestedStack/nested.NestedStackResource': { stackPath: 'stack', id: 'nested.NestedStackResource' },
                    'stack/nested/nestedVpc': { stackPath: 'stack/nested', id: 'nestedVpc' },
                    'stack/nested/cidr': { stackPath: 'stack/nested', id: 'cidr' },
                    'stack/otherNested.NestedStack/otherNested.NestedStackResource': { stackPath: 'stack', id: 'otherNested.NestedStackResource' },
                    'stack/otherNested/nestedVpc2': { stackPath: 'stack/otherNested', id: 'nestedVpc2' },
                    'stack/otherNested/cidr': { stackPath: 'stack/otherNested', id: 'cidr' },
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
                        nested: {
                            id: 'nested',
                            path: 'stack/nested',
                            children: {
                                nestedVpc: {
                                    id: 'nestedVpc',
                                    path: 'stack/nested/nestedVpc',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPC',
                                    },
                                },
                                cidr: {
                                    id: 'cidr',
                                    path: 'stack/nested/cidr',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPCCidrBlock',
                                    },
                                },
                            },
                        },
                        "nested.NestedStack": {
                            id: 'nested.NestedStack',
                            path: 'stack/nested.NestedStack',
                            children: {
                                'nested.NestedStackResource': {
                                    id: 'nested.NestedStackResource',
                                    path: 'stack/nested.NestedStack/nested.NestedStackResource',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::CloudFormation::Stack',
                                    },
                                },
                            }
                        },
                        otherNested: {
                            id: 'otherNested',
                            path: 'stack/otherNested',
                            children: {
                                nestedVpc2: {
                                    id: 'nestedVpc2',
                                    path: 'stack/otherNested/nestedVpc2',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPC',
                                    },
                                },
                                cidr: {
                                    id: 'cidr2',
                                    path: 'stack/otherNested/cidr',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPCCidrBlock',
                                    },
                                },
                            }
                        },
                        "otherNested.NestedStack": {
                            id: 'otherNested.NestedStack',
                            path: 'stack/otherNested.NestedStack',
                            children: {
                                'otherNested.NestedStackResource': {
                                    id: 'otherNested.NestedStackResource',
                                    path: 'stack/otherNested.NestedStack/otherNested.NestedStackResource',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::CloudFormation::Stack',
                                    },
                                },
                            }
                        }
                    },
                    constructInfo: {
                        fqn: 'aws-cdk-lib.Stack',
                        version: '2.149.0',
                    },
                },
                nestedStacks: {
                    'stack/nested': {
                        logicalId: 'nested',
                        Resources: {
                            nestedVpc: {
                                Type: 'AWS::EC2::VPC',
                                Properties: {},
                            },
                            cidr: {
                                Type: 'AWS::EC2::VPCCidrBlock',
                                Properties: {
                                    VpcId: { Ref: 'nestedVpc' },
                                    Ipv6CidrBlock: 'cidr_ipv6AddressAttribute',
                                },
                            },
                        },
                    },
                    'stack/otherNested': {
                        logicalId: 'nested',
                        Resources: {
                            nestedVpc2: {
                                Type: 'AWS::EC2::VPC',
                                Properties: {},
                            },
                            cidr: {
                                Type: 'AWS::EC2::VPCCidrBlock',
                                Properties: {
                                    VpcId: { Ref: 'nestedVpc2' },
                                    Ipv6CidrBlock: 'cidr_ipv6AddressAttribute',
                                },
                            },
                        },
                    }
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
                        "nested.NestedStackResource": {
                            Type: 'AWS::CloudFormation::Stack',
                            Properties: {},
                        },
                        "otherNested.NestedStackResource": {
                            Type: 'AWS::CloudFormation::Stack',
                            Properties: {},
                        },
                    },
                },
                dependencies: [],
            });
    
            const app = new MockAppComponent('/tmp/foo/bar/does/not/exist');
            const stagingBucket = 'my-bucket';
            const customResourcePrefix = 'my-prefix';
            app.stacks[manifest.id] = {
                synthesizer: new MockSynth(stagingBucket, customResourcePrefix),
                node: {
                    id: 'my-stack',
                },
                resolve: (obj: any) => ({ Ref: 'nestedVpc' }),
            } as unknown as CdkStack;
            const converter = new StackConverter(app, manifest);
            converter.convert(new Set());
    
            const result = await promiseOf(converter.asOutputValue("DUMMY") as any);
            expect(result).toEqual("nestedVpc_id");
        });
    
        test('throws if token is found in multiple stacks', async () => {
            const manifest = new StackManifest({
                id: 'stack',
                templatePath: 'test/stack',
                metadata: {
                    'stack/vpc': { stackPath: 'stack', id: 'vpc' },
                    'stack/cidr': { stackPath: 'stack', id: 'cidr' },
                    'stack/nested.NestedStack/nested.NestedStackResource': { stackPath: 'stack', id: 'nested.NestedStackResource' },
                    'stack/nested/nestedVpc': { stackPath: 'stack/nested', id: 'nestedVpc' },
                    'stack/nested/cidr': { stackPath: 'stack/nested', id: 'cidr' },
                    'stack/otherNested.NestedStack/otherNested.NestedStackResource': { stackPath: 'stack', id: 'otherNested.NestedStackResource' },
                    'stack/otherNested/nestedVpc': { stackPath: 'stack/otherNested', id: 'nestedVpc' },
                    'stack/otherNested/cidr': { stackPath: 'stack/otherNested', id: 'cidr' },
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
                        nested: {
                            id: 'nested',
                            path: 'stack/nested',
                            children: {
                                nestedVpc: {
                                    id: 'vpc',
                                    path: 'stack/nested/nestedVpc',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPC',
                                    },
                                },
                                cidr: {
                                    id: 'cidr',
                                    path: 'stack/nested/cidr',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPCCidrBlock',
                                    },
                                },
                            },
                        },
                        "nested.NestedStack": {
                            id: 'nested.NestedStack',
                            path: 'stack/nested.NestedStack',
                            children: {
                                'nested.NestedStackResource': {
                                    id: 'nested.NestedStackResource',
                                    path: 'stack/nested.NestedStack/nested.NestedStackResource',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::CloudFormation::Stack',
                                    },
                                },
                            }
                        },
                        otherNested: {
                            id: 'otherNested',
                            path: 'stack/otherNested',
                            children: {
                                nestedVpc: {
                                    id: 'vpc',
                                    path: 'stack/otherNested/nestedVpc',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPC',
                                    },
                                },
                                cidr: {
                                    id: 'cidr',
                                    path: 'stack/otherNested/cidr',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::EC2::VPCCidrBlock',
                                    },
                                },
                            }
                        },
                        "otherNested.NestedStack": {
                            id: 'otherNested.NestedStack',
                            path: 'stack/otherNested.NestedStack',
                            children: {
                                'otherNested.NestedStackResource': {
                                    id: 'otherNested.NestedStackResource',
                                    path: 'stack/otherNested.NestedStack/otherNested.NestedStackResource',
                                    attributes: {
                                        'aws:cdk:cloudformation:type': 'AWS::CloudFormation::Stack',
                                    },
                                },
                            }
                        }
                    },
                    constructInfo: {
                        fqn: 'aws-cdk-lib.Stack',
                        version: '2.149.0',
                    },
                },
                nestedStacks: {
                    'stack/nested': {
                        logicalId: 'nested',
                        Resources: {
                            nestedVpc: {
                                Type: 'AWS::EC2::VPC',
                                Properties: {},
                            },
                            cidr: {
                                Type: 'AWS::EC2::VPCCidrBlock',
                                Properties: {
                                    VpcId: { Ref: 'nestedVpc' },
                                    Ipv6CidrBlock: 'cidr_ipv6AddressAttribute',
                                },
                            },
                        },
                    },
                    'stack/otherNested': {
                        logicalId: 'nested',
                        Resources: {
                            nestedVpc: {
                                Type: 'AWS::EC2::VPC',
                                Properties: {},
                            },
                            cidr: {
                                Type: 'AWS::EC2::VPCCidrBlock',
                                Properties: {
                                    VpcId: { Ref: 'nestedVpc' },
                                    Ipv6CidrBlock: 'cidr_ipv6AddressAttribute',
                                },
                            },
                        },
                    }
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
                        "nested.NestedStackResource": {
                            Type: 'AWS::CloudFormation::Stack',
                            Properties: {},
                        },
                        "otherNested.NestedStackResource": {
                            Type: 'AWS::CloudFormation::Stack',
                            Properties: {},
                        },
                    },
                },
                dependencies: [],
            });
    
            const app = new MockAppComponent('/tmp/foo/bar/does/not/exist');
            const stagingBucket = 'my-bucket';
            const customResourcePrefix = 'my-prefix';
            app.stacks[manifest.id] = {
                synthesizer: new MockSynth(stagingBucket, customResourcePrefix),
                node: {
                    id: 'my-stack',
                },
                resolve: (obj: any) => ({ Ref: 'nestedVpc' }),
            } as unknown as CdkStack;
            const converter = new StackConverter(app, manifest);
            converter.convert(new Set());
            expect(() => converter.asOutputValue("DUMMY")).toThrow("[CDK Adapter] Value found in multiple stacks: stack/nested and stack/otherNested. Pulumi cannot resolve this value.");
        });
    });
});

function createUrn(resource: string, logicalId: string): string {
    return `urn:pulumi:stack::project::cdk:construct:aws-cdk-lib/aws_s3:${resource}$aws-native:s3:${resource}::${logicalId}`;
}
