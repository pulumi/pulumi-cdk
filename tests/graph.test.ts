// Copyright 2016-2022, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { GraphBuilder, GraphNode } from '../src/graph';
import { StackManifest } from '../src/assembly';
import { createStackManifest } from './utils';

describe('GraphBuilder', () => {
    const nodes = new GraphBuilder(
        new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/example-bucket/Resource': 'examplebucketC9DFA43E',
                'stack/example-bucket/Policy/Resource': 'examplebucketPolicyE09B485E',
            },
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    'example-bucket': {
                        id: 'example-bucket',
                        path: 'stack/example-bucket',
                        constructInfo: {
                            fqn: 'aws-cdk-lib.aws_s3.Bucket',
                            version: '2.149.0',
                        },
                        children: {
                            Resource: {
                                id: 'Resource',
                                path: 'stack/example-bucket/Resource',
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
                                path: 'stack/example-bucket/Policy',
                                children: {
                                    Resource: {
                                        id: 'Resource',
                                        path: 'stack/example-bucket/Policy/Resource',
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
                    },
                },
                constructInfo: {
                    fqn: 'aws-cdk-lib.Stack',
                    version: '2.149.0',
                },
            },
            template: {
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
            },
            dependencies: [],
        }),
    ).build();
    test.each([
        [
            nodes,
            'stack',
            {
                construct: {
                    path: 'stack',
                    id: 'stack',
                    type: 'aws-cdk-lib:Stack',
                    parent: undefined,
                },
                logicalId: undefined,
                resource: undefined,
                incomingEdges: ['stack/example-bucket'],
                outgoingEdges: [],
            },
        ],
        [
            nodes,
            'stack/example-bucket',
            {
                construct: {
                    parent: 'stack',
                    path: 'stack/example-bucket',
                    id: 'example-bucket',
                    type: 'aws-cdk-lib/aws_s3:Bucket',
                },
                logicalId: undefined,
                resource: undefined,
                incomingEdges: ['stack/example-bucket/Resource', 'stack/example-bucket/Policy'],
                outgoingEdges: ['stack'],
            },
        ],
        [
            nodes,
            'stack/example-bucket/Resource',
            {
                construct: {
                    parent: 'example-bucket',
                    path: 'stack/example-bucket/Resource',
                    id: 'Resource',
                    type: 'Bucket',
                },
                resource: {
                    Type: 'AWS::S3::Bucket',
                    Properties: {},
                },
                logicalId: 'examplebucketC9DFA43E',
                incomingEdges: ['stack/example-bucket/Policy/Resource'],
                outgoingEdges: ['stack/example-bucket'],
            },
        ],
        [
            nodes,
            'stack/example-bucket/Policy',
            {
                construct: {
                    parent: 'example-bucket',
                    path: 'stack/example-bucket/Policy',
                    id: 'Policy',
                    type: 'aws-cdk-lib/aws_s3:BucketPolicy',
                },
                logicalId: undefined,
                resource: undefined,
                incomingEdges: ['stack/example-bucket/Policy/Resource'],
                outgoingEdges: ['stack/example-bucket'],
            },
        ],
        [
            nodes,
            'stack/example-bucket/Policy/Resource',
            {
                construct: {
                    parent: 'Policy',
                    path: 'stack/example-bucket/Policy/Resource',
                    id: 'Resource',
                    type: 'BucketPolicy',
                },
                resource: {
                    Type: 'AWS::S3::BucketPolicy',
                    Properties: {
                        Bucket: {
                            Ref: 'examplebucketC9DFA43E',
                        },
                    },
                },
                logicalId: 'examplebucketPolicyE09B485E',
                incomingEdges: [],
                outgoingEdges: ['stack/example-bucket/Policy', 'stack/example-bucket/Resource'],
            },
        ],
    ])('Parses the graph correctly', (graph, path, expected) => {
        const actual = graph.find((node) => node.construct.path === path);
        expect(actual).toBeDefined();
        expect(actual!.logicalId).toEqual(expected.logicalId);
        expect(actual!.resource).toEqual(expected.resource);
        expect(actual!.construct.parent?.id).toEqual(expected.construct.parent);
        expect(actual!.construct.type).toEqual(expected.construct.type);
        expect(edgesToArray(actual!.incomingEdges)).toEqual(expected.incomingEdges);
        expect(edgesToArray(actual!.outgoingEdges)).toEqual(expected.outgoingEdges);
    });

    test.each([
        ['dependsOn', createStackManifest({}, {}, ['resource1'])],
        [
            'ref',
            createStackManifest({
                SomeProp: { Ref: 'resource1' },
            }),
        ],
        [
            'GetAtt',
            createStackManifest({
                SomeProp: { 'Fn::GetAtt': ['resource1', 'Arn'] },
            }),
        ],
        [
            'Sub-Ref',
            createStackManifest({
                SomeProp: { 'Fn::Sub': ['www.${Domain}', { Domain: { Ref: 'resource1' } }] },
            }),
        ],
        [
            'Sub-GetAtt',
            createStackManifest({
                SomeProp: { 'Fn::Sub': ['www.${Domain}', { Domain: { 'Fn::GetAtt': ['resource1', 'Arn'] } }] },
            }),
        ],
    ])('adds edge for %s', (_name, stackManifest) => {
        const graph = new GraphBuilder(stackManifest).build();
        expect(graph[1].construct.path).toEqual('stack/resource-1');
        expect(edgesToArray(graph[1].incomingEdges)).toEqual(['stack/resource-2']);
        expect(edgesToArray(graph[1].outgoingEdges)).toEqual(['stack']);
        expect(graph[2].construct.path).toEqual('stack/resource-2');
        expect(edgesToArray(graph[2].incomingEdges)).toEqual([]);
        expect(edgesToArray(graph[2].outgoingEdges)).toEqual(['stack', 'stack/resource-1']);
    });
});
test('vpc with ipv6 cidr block', () => {
    const nodes = new GraphBuilder(
        new StackManifest({
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
                            'aws:cdk:cloudformation:type': 'AWS::Other::Resource',
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
                        Properties: {},
                    },
                    other: {
                        Type: 'AWS::Other::Resource',
                        Properties: {
                            SomeProp: { 'Fn::Select': [0, { 'Fn::GetAtt': ['vpc', 'Ipv6CidrBlocks'] }] },
                        },
                    },
                },
            },
            dependencies: [],
        }),
    ).build();
    expect(nodes[0].construct.type).toEqual('aws-cdk-lib:Stack');
    expect(nodes[1].construct.type).toEqual('VPC');
    expect(nodes[2].construct.type).toEqual('VPCCidrBlock');
    expect(nodes[2].incomingEdges.size).toEqual(1);
    expect(nodes[3].construct.type).toEqual('Resource');

    // The other resource should have it's edge swapped to the cidr resource
    expect(Array.from(nodes[2].incomingEdges.values())[0].logicalId).toEqual('other');
    expect(Array.from(nodes[3].outgoingEdges.values())[1].logicalId).toEqual('cidr');
});

test('pulumi resource type name fallsback when fqn not available', () => {
    const bucketId = 'example-bucket';
    const policyResourceId = 'Policy';
    const nodes = new GraphBuilder(
        new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/example-bucket/Resource': 'examplebucketC9DFA43E',
                'stack/example-bucket/Policy/Resource': 'examplebucketPolicyE09B485E',
            },
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    [bucketId]: {
                        id: bucketId,
                        path: 'stack/example-bucket',
                        children: {
                            Resource: {
                                id: 'Resource',
                                path: 'stack/example-bucket/Resource',
                                attributes: {
                                    'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                                },
                                constructInfo: {
                                    fqn: 'aws-cdk-lib.aws_s3.CfnBucket',
                                    version: '2.149.0',
                                },
                            },
                            [policyResourceId]: {
                                id: policyResourceId,
                                path: 'stack/example-bucket/Policy',
                                children: {
                                    Resource: {
                                        id: 'Resource',
                                        path: 'stack/example-bucket/Policy/Resource',
                                        attributes: {
                                            'aws:cdk:cloudformation:type': 'AWS::S3::BucketPolicy',
                                        },
                                        constructInfo: {
                                            fqn: 'aws-cdk-lib.aws_s3.CfnBucketPolicy',
                                            version: '2.149.0',
                                        },
                                    },
                                },
                            },
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
            },
            dependencies: [],
        }),
    ).build();

    expect(nodes[0].construct.type).toEqual('aws-cdk-lib:Stack');
    expect(nodes[1].construct.type).toEqual(bucketId);
    expect(nodes[2].construct.type).toEqual('Bucket');
    expect(nodes[3].construct.type).toEqual(policyResourceId);
    expect(nodes[4].construct.type).toEqual('BucketPolicy');
});

function edgesToArray(edges: Set<GraphNode>): string[] {
    return Array.from(edges).flatMap((value) => value.construct.path);
}
