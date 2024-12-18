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
import { ConstructTree, StackManifest, StackManifestProps } from '../src/assembly';
import { createNestedStackManifest, createStackManifest } from './utils';
import * as fs from 'fs';
import * as path from 'path';

describe('GraphBuilder', () => {
    const nodes = GraphBuilder.build(
        new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/example-bucket/Resource': { stackPath: 'stack', id: 'examplebucketC9DFA43E' },
                'stack/example-bucket/Policy/Resource': { stackPath: 'stack', id: 'examplebucketPolicyE09B485E' },
                'stack/nested.NestedStack/nested.NestedStackResource': { stackPath: 'stack', id: 'nested.NestedStackResource' },
                'stack/nested/example-bucket/Resource': { stackPath: 'stack/nested', id: 'examplebucketdDE4DBE4F' },
                'stack/nested/example-bucket/Policy/Resource': { stackPath: 'stack/nested', id: 'examplebucketPolicyC4E3BBE2F' },
                'stack/output-bucket/Resource': { stackPath: 'stack', id: 'outputbucketC9DFA43E' },
                'stack/output-bucket/Policy/Resource': { stackPath: 'stack', id: 'outputbucketPolicyE09B485E' },
            },
            nestedStacks: {
                'stack/nested': {
                    logicalId: 'nested.NestedStack',
                    Resources: {
                        examplebucketdDE4DBE4F: {
                            Type: 'AWS::S3::Bucket',
                            Properties: {
                                BucketName: {
                                    "Fn::Join": [
                                        "",
                                        [
                                            {
                                                "Ref": "referencetostackexamplebucketC9DFA43ERef"
                                            },
                                            "-nested"
                                        ]
                                    ]
                                }
                            },
                        },
                        examplebucketPolicyC4E3BBE2F: {
                            Type: 'AWS::S3::BucketPolicy',
                            Properties: {
                                Bucket: {
                                    Ref: 'examplebucketdDE4DBE4F',
                                },
                            },
                        },
                    },
                    Outputs: {
                        stacknestedexamplebucketdDE4DBE4FRef: {
                            Value: {
                                Ref: 'examplebucketdDE4DBE4F',
                            },
                        },
                    },
                    Parameters: {
                        referencetostackexamplebucketC9DFA43ERef: {
                            Type: 'String',
                        },
                    },
                },
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
                    nested: {
                        id: 'nested',
                        path: 'stack/nested',
                        children: {
                            'example-bucket': {
                                id: 'example-bucket',
                                path: 'stack/nested/example-bucket',
                                constructInfo: {
                                    fqn: 'aws-cdk-lib.aws_s3.Bucket',
                                    version: '2.149.0',
                                },
                                children: {
                                    Resource: {
                                        id: 'Resource',
                                        path: 'stack/nested/example-bucket/Resource',
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
                                        path: 'stack/nested/example-bucket/Policy',
                                        children: {
                                            Resource: {
                                                id: 'Resource',
                                                path: 'stack/nested/example-bucket/Policy/Resource',
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
                            fqn: 'aws-cdk-lib.NestedStack',
                            version: '2.149.0',
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
                                constructInfo: {
                                    fqn: 'aws-cdk-lib.CfnStack',
                                    version: '2.149.0',
                                },
                            },
                        }
                    },
                    'output-bucket': {
                        id: 'output-bucket',
                        path: 'stack/output-bucket',
                        constructInfo: {
                            fqn: 'aws-cdk-lib.aws_s3.Bucket',
                            version: '2.149.0',
                        },
                        children: {
                            Resource: {
                                id: 'Resource',
                                path: 'stack/output-bucket/Resource',
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
                                path: 'stack/output-bucket/Policy',
                                children: {
                                    Resource: {
                                        id: 'Resource',
                                        path: 'stack/output-bucket/Policy/Resource',
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
                    "nested.NestedStackResource": {
                        Type: 'AWS::CloudFormation::Stack',
                        Properties: {
                            Parameters: {
                                referencetostackexamplebucketC9DFA43ERef: {
                                    Ref: 'examplebucketC9DFA43E',
                                }
                            }
                        },
                    },
                    outputbucketC9DFA43E: {
                        Type: 'AWS::S3::Bucket',
                        Properties: {
                            BucketName: {
                                "Fn::Join": [
                                    "",
                                    [
                                        {
                                            "Fn::GetAtt": [
                                                "nested.NestedStackResource",
                                                "Outputs.stacknestedexamplebucketdDE4DBE4FRef"
                                            ]
                                        },
                                        "-output"
                                    ]
                                ]
                            }
                        },
                    },
                    outputbucketPolicyE09B485E: {
                        Type: 'AWS::S3::BucketPolicy',
                        Properties: {
                            Bucket: {
                                Ref: 'outputbucketC9DFA43E',
                            },
                        },
                    },
                },
            },
            dependencies: [],
        }),
    );
    test.each([
        [
            'stack',
            {
                construct: {
                    path: 'stack',
                    id: 'stack',
                    type: 'aws-cdk-lib:Stack',
                    parent: undefined,
                },
                resourceAddress: undefined,
                resource: undefined,
                incomingEdges: ['stack/example-bucket', 'stack/nested', 'stack/output-bucket'],
                outgoingEdges: [],
            },
        ],
        [
            'stack/example-bucket',
            {
                construct: {
                    parent: 'stack',
                    path: 'stack/example-bucket',
                    id: 'example-bucket',
                    type: 'aws-cdk-lib/aws_s3:Bucket',
                },
                resourceAddress: undefined,
                resource: undefined,
                incomingEdges: ['stack/example-bucket/Resource', 'stack/example-bucket/Policy'],
                outgoingEdges: ['stack'],
            },
        ],
        [
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
                resourceAddress: { stackPath: 'stack', id: 'examplebucketC9DFA43E' },
                incomingEdges: ['stack/example-bucket/Policy/Resource', 'stack/nested'],
                outgoingEdges: ['stack/example-bucket'],
            },
        ],
        [
            'stack/example-bucket/Policy',
            {
                construct: {
                    parent: 'example-bucket',
                    path: 'stack/example-bucket/Policy',
                    id: 'Policy',
                    type: 'aws-cdk-lib/aws_s3:BucketPolicy',
                },
                resourceAddress: undefined,
                resource: undefined,
                incomingEdges: ['stack/example-bucket/Policy/Resource'],
                outgoingEdges: ['stack/example-bucket'],
            },
        ],
        [
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
                resourceAddress: { stackPath: 'stack', id: 'examplebucketPolicyE09B485E' },
                incomingEdges: [],
                outgoingEdges: ['stack/example-bucket/Policy', 'stack/example-bucket/Resource'],
            },
        ],
        [
            'stack/nested',
            {
                construct: {
                    parent: 'stack',
                    path: 'stack/nested',
                    id: 'nested',
                    type: 'Stack',
                },
                resourceAddress: { stackPath: 'stack', id: 'nested.NestedStackResource' },
                resource: {
                    Type: 'AWS::CloudFormation::Stack',
                    Properties: {
                        Parameters: {
                            referencetostackexamplebucketC9DFA43ERef: {
                                Ref: 'examplebucketC9DFA43E',
                            }
                        }
                    },
                },
                incomingEdges: ['stack/nested/example-bucket', 'stack/output-bucket/Resource'],
                outgoingEdges: ['stack', 'stack/example-bucket/Resource'], // the outgoing edge for 'stack/example-bucket/Resource' is the stack parameter
            },
        ],
        [
            'stack/nested/example-bucket',
            {
                construct: {
                    parent: 'nested',
                    path: 'stack/nested/example-bucket',
                    id: 'example-bucket',
                    type: 'aws-cdk-lib/aws_s3:Bucket',
                },
                resourceAddress: undefined,
                resource: undefined,
                incomingEdges: ['stack/nested/example-bucket/Resource', 'stack/nested/example-bucket/Policy'],
                outgoingEdges: ['stack/nested'],
            },
        ],
        [
            'stack/nested/example-bucket/Resource',
            {
                construct: {
                    parent: 'example-bucket',
                    path: 'stack/nested/example-bucket/Resource',
                    id: 'Resource',
                    type: 'Bucket',
                },
                resourceAddress: { stackPath: 'stack/nested', id: 'examplebucketdDE4DBE4F' },
                resource: {
                    Type: 'AWS::S3::Bucket',
                    Properties: {
                        BucketName: {
                            "Fn::Join": [
                                "",
                                [
                                    {
                                        "Ref": "referencetostackexamplebucketC9DFA43ERef"
                                    },
                                    "-nested"
                                ]
                            ]
                        }
                    },
                },
                incomingEdges: ['stack/nested/example-bucket/Policy/Resource', 'stack/output-bucket/Resource'], // the incoming edge for 'stack/output-bucket/Resource' is the stack output
                outgoingEdges: ['stack/nested/example-bucket'],
            },
        ],
        [
            'stack/nested/example-bucket/Policy/Resource',
            {
                construct: {
                    parent: 'Policy',
                    path: 'stack/nested/example-bucket/Policy/Resource',
                    id: 'Resource',
                    type: 'BucketPolicy',
                },
                resourceAddress: { stackPath: 'stack/nested', id: 'examplebucketPolicyC4E3BBE2F' },
                resource: {
                    Type: 'AWS::S3::BucketPolicy',
                    Properties: {
                        Bucket: {
                            Ref: 'examplebucketdDE4DBE4F',
                        },
                    },
                },
                incomingEdges: [],
                outgoingEdges: ['stack/nested/example-bucket/Policy', 'stack/nested/example-bucket/Resource'],
            },
        ],
        [
            'stack/output-bucket',
            {
                construct: {
                    parent: 'stack',
                    path: 'stack/output-bucket',
                    id: 'output-bucket',
                    type: 'aws-cdk-lib/aws_s3:Bucket',
                },
                resourceAddress: undefined,
                resource: undefined,
                incomingEdges: ['stack/output-bucket/Resource', 'stack/output-bucket/Policy'],
                outgoingEdges: ['stack'],
            },
        ],
        [
            'stack/output-bucket/Resource',
            {
                construct: {
                    parent: 'output-bucket',
                    path: 'stack/output-bucket/Resource',
                    id: 'Resource',
                    type: 'Bucket',
                },
                resourceAddress: { stackPath: 'stack', id: 'outputbucketC9DFA43E' },
                resource: {
                    Type: 'AWS::S3::Bucket',
                    Properties: {
                        BucketName: {
                            "Fn::Join": [
                                "",
                                [
                                    {
                                        "Fn::GetAtt": [
                                            "nested.NestedStackResource",
                                            "Outputs.stacknestedexamplebucketdDE4DBE4FRef"
                                        ]
                                    },
                                    "-output"
                                ]
                            ]
                        }
                    },
                },
                incomingEdges: ['stack/output-bucket/Policy/Resource'],
                outgoingEdges: ['stack/output-bucket', 'stack/nested', 'stack/nested/example-bucket/Resource'], // the outgoing edge for 'stack/nested/example-bucket/Resource' is the nested stack output
            },
        ],
        [
            'stack/output-bucket/Policy',
            {
                construct: {
                    parent: 'output-bucket',
                    path: 'stack/output-bucket/Policy',
                    id: 'Policy',
                    type: 'aws-cdk-lib/aws_s3:BucketPolicy',
                },
                resourceAddress: undefined,
                resource: undefined,
                incomingEdges: ['stack/output-bucket/Policy/Resource'],
                outgoingEdges: ['stack/output-bucket'],
            },
        ],
        [
            'stack/output-bucket/Policy/Resource',
            {
                construct: {
                    parent: 'Policy',
                    path: 'stack/output-bucket/Policy/Resource',
                    id: 'Resource',
                    type: 'BucketPolicy',
                },
                resourceAddress: { stackPath: 'stack', id: 'outputbucketPolicyE09B485E' },
                resource: {
                    Type: 'AWS::S3::BucketPolicy',
                    Properties: {
                        Bucket: {
                            Ref: 'outputbucketC9DFA43E',
                        },
                    },
                },
                incomingEdges: [],
                outgoingEdges: ['stack/output-bucket/Policy', 'stack/output-bucket/Resource'],
            },
        ],
    ])('Parses the graph correctly: %s', (path, expected) => {
        const actual = nodes.nodes.find((node) => node.construct.path === path);
        expect(actual).toBeDefined();
        expect(actual!.resourceAddress).toEqual(expected.resourceAddress);
        expect(actual!.resource).toEqual(expected.resource);
        expect(actual!.construct.parent?.id).toEqual(expected.construct.parent);
        expect(actual!.construct.type).toEqual(expected.construct.type);
        expect(new Set(edgesToArray(actual!.incomingEdges))).toEqual(new Set(expected.incomingEdges));
        expect(new Set(edgesToArray(actual!.outgoingEdges))).toEqual(new Set(expected.outgoingEdges));
    });

    test.each([
        ['dependsOn', createStackManifest({ resource2Props: {}, resource2DependsOn: ['resource1'] })],
        [
            'ref',
            createStackManifest({
                resource2Props: {
                    SomeProp: { Ref: 'resource1' },
                },
            }),
        ],
        [
            'GetAtt',
            createStackManifest({
                resource2Props: {
                    SomeProp: { 'Fn::GetAtt': ['resource1', 'Arn'] },
                },
            }),
        ],
        [
            'Sub-Ref',
            createStackManifest({
                resource2Props: {
                    SomeProp: { 'Fn::Sub': ['www.${Domain}', { Domain: { Ref: 'resource1' } }] },
                },
            }),
        ],
        [
            'Sub-GetAtt',
            createStackManifest({
                resource2Props: {
                    SomeProp: { 'Fn::Sub': ['www.${Domain}', { Domain: { 'Fn::GetAtt': ['resource1', 'Arn'] } }] },
                },
            }),
        ],
    ])('adds edge for %s', (_name, stackManifest) => {
        const graph = GraphBuilder.build(stackManifest).nodes;
        expect(graph[1].construct.path).toEqual('stack/resource-1');
        expect(edgesToArray(graph[1].incomingEdges)).toEqual(['stack/resource-2']);
        expect(edgesToArray(graph[1].outgoingEdges)).toEqual(['stack']);
        expect(graph[2].construct.path).toEqual('stack/resource-2');
        expect(edgesToArray(graph[2].incomingEdges)).toEqual([]);
        expect(edgesToArray(graph[2].outgoingEdges)).toEqual(['stack', 'stack/resource-1']);
    });
});

test.each([
    [
        'Ref stack input',
        createNestedStackManifest({
            nestedStackResourceProps: {
                Parameters: {
                    parentRef: { Ref: 'parent' },
                }
            },
            nestedStackParameters: {
                parentRef: {
                    Type: 'String',
                },
            },
            nestedResourceProps: {
                BucketName: {
                    "Fn::Join": [
                        "",
                        [
                            {
                                "Ref": "parentRef"
                            },
                            "-nested"
                        ]
                    ]
                }
            },
        }),
        {
            stackInput: true,
            stackOutput: false,
        }
    ],
    [
        'GetAtt stack output',
        createNestedStackManifest({
            nestedStackOutputs: {
                nestedStackOutput: {
                    Value: {
                        Ref: 'child',
                    },
                },
            },
            outputResourceProps: {
                BucketName: {
                    "Fn::Join": [
                        "",
                        [
                            {
                                "Fn::GetAtt": [
                                    "nested.NestedStackResource",
                                    "Outputs.nestedStackOutput"
                                ]
                            },
                            "-output"
                        ]
                    ]
                }
            }
        }),
        {
            stackInput: false,
            stackOutput: true,
        }
    ],
    [
        'Ref stack input and GetAtt stack output',
        createNestedStackManifest({
            nestedStackResourceProps: {
                Parameters: {
                    parentRef: { Ref: 'parent' },
                }
            },
            nestedStackParameters: {
                parentRef: {
                    Type: 'String',
                },
            },
            nestedResourceProps: {
                BucketName: {
                    "Fn::Join": [
                        "",
                        [
                            {
                                "Ref": "parentRef"
                            },
                            "-nested"
                        ]
                    ]
                }
            },
            nestedStackOutputs: {
                nestedStackOutput: {
                    Value: {
                        Ref: 'child',
                    },
                },
            },
            outputResourceProps: {
                BucketName: {
                    "Fn::Join": [
                        "",
                        [
                            {
                                "Fn::GetAtt": [
                                    "nested.NestedStackResource",
                                    "Outputs.nestedStackOutput"
                                ]
                            },
                            "-output"
                        ]
                    ]
                }
            }
        }),
        {
            stackInput: true,
            stackOutput: true,
        }
    ],
    [
        'Sub-Ref stack input',
        createNestedStackManifest({
            nestedStackResourceProps: {
                Parameters: {
                    parentRef: { 'Fn::Sub': ['test.${Domain}', { Domain: { Ref: 'parent' } }] },
                }
            },
            nestedStackParameters: {
                parentRef: {
                    Type: 'String',
                },
            },
            nestedResourceProps: {
                BucketName: { 'Fn::Sub': ['sub.${Domain}', { Domain: { Ref: 'parentRef' } }] }
            },
        }),
        {
            stackInput: true,
            stackOutput: false,
        }
    ],
    [
        'Sub-GetAtt stack output',
        createNestedStackManifest({
            nestedStackOutputs: {
                nestedStackOutput: {
                    Value: { 'Fn::Sub': ['test.${Domain}', { Domain: { Ref: 'child' } }] },
                },
            },
            outputResourceProps: {
                BucketName: {
                    'Fn::Sub': ['sub.${Domain}', {
                        Domain: {
                            "Fn::GetAtt": [
                                "nested.NestedStackResource",
                                "Outputs.nestedStackOutput"
                            ]
                        }
                    }]
                },
            }
        }),
        {
            stackInput: false,
            stackOutput: true,
        }
    ]
])('nested stack adds edge for %s', (_name, stackManifest, expected) => {
    const graph = GraphBuilder.build(stackManifest).nodes;
    const childNode = graph.find((node) => node.construct.path === 'stack/nested/example-bucket/Resource');
    const parentNode = graph.find((node) => node.construct.path === 'stack/example-bucket/Resource');
    const outputNode = graph.find((node) => node.construct.path === 'stack/output-bucket/Resource');
    const nestedStackNode = graph.find((node) => node.construct.path === 'stack/nested');

    expect(new Set(edgesToArray(parentNode!.outgoingEdges))).toEqual(new Set(['stack/example-bucket']));
    expect(new Set(edgesToArray(childNode!.outgoingEdges))).toEqual(new Set(['stack/nested/example-bucket']));
    expect(new Set(edgesToArray(outputNode!.incomingEdges))).toEqual(new Set(['stack/output-bucket/Policy/Resource']));

    if (expected.stackInput) {
        // The nested stack should depend on its inputs
        expect(new Set(edgesToArray(parentNode!.incomingEdges))).toEqual(new Set(['stack/nested', 'stack/example-bucket/Policy/Resource']));
    } else {
        expect(new Set(edgesToArray(parentNode!.incomingEdges))).toEqual(new Set(['stack/example-bucket/Policy/Resource']));
    }

    if (expected.stackOutput) {
        // the resource using the nested stack output should depend on the nested stack and the child resource
        expect(new Set(edgesToArray(nestedStackNode!.incomingEdges))).toEqual(new Set(['stack/nested/example-bucket', 'stack/output-bucket/Resource']));
        expect(new Set(edgesToArray(childNode!.incomingEdges))).toEqual(new Set(['stack/nested/example-bucket/Policy/Resource', 'stack/output-bucket/Resource']));
        expect(new Set(edgesToArray(outputNode!.outgoingEdges))).toEqual(new Set(['stack/output-bucket', 'stack/nested', 'stack/nested/example-bucket/Resource']));
    } else {
        expect(new Set(edgesToArray(nestedStackNode!.incomingEdges))).toEqual(new Set(['stack/nested/example-bucket']));
        expect(new Set(edgesToArray(childNode!.incomingEdges))).toEqual(new Set(['stack/nested/example-bucket/Policy/Resource']));
        expect(new Set(edgesToArray(outputNode!.outgoingEdges))).toEqual(new Set(['stack/output-bucket']));
    }

    // Nested stack outgoing edges depend on inputs and outputs
    if (expected.stackInput && expected.stackOutput) {
        expect(new Set(edgesToArray(nestedStackNode!.outgoingEdges))).toEqual(new Set(['stack', 'stack/example-bucket/Resource']));
    } else if (expected.stackInput) {
        expect(new Set(edgesToArray(nestedStackNode!.outgoingEdges))).toEqual(new Set(['stack', 'stack/example-bucket/Resource']));
    } else if (expected.stackOutput) {
        expect(new Set(edgesToArray(nestedStackNode!.outgoingEdges))).toEqual(new Set(['stack']));
    }
});

test('vpc with ipv6 cidr block', () => {
    const nodes = GraphBuilder.build(
        new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/vpc': { stackPath: 'stack', id: 'vpc' },
                'stack/cidr': { stackPath: 'stack', id: 'cidr' },
                'stack/other': { stackPath: 'stack', id: 'other' },
            },
            nestedStacks: {},
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
                        Properties: {
                            VpcId: { Ref: 'vpc' },
                        },
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
    ).nodes;
    expect(nodes[0].construct.type).toEqual('aws-cdk-lib:Stack');
    expect(nodes[1].construct.type).toEqual('VPC');
    expect(nodes[2].construct.type).toEqual('VPCCidrBlock');
    expect(nodes[2].incomingEdges.size).toEqual(1);
    expect(nodes[3].construct.type).toEqual('Resource');

    // The other resource should have it's edge swapped to the cidr resource
    expect(Array.from(nodes[2].incomingEdges.values())[0].resourceAddress).toEqual({ stackPath: 'stack', id: 'other' });
    expect(Array.from(nodes[3].outgoingEdges.values())[1].resourceAddress).toEqual({ stackPath: 'stack', id: 'cidr' });
});

test('vpc with multiple ipv6 cidr blocks fails', () => {
    expect(() => {
        GraphBuilder.build(
            new StackManifest({
                id: 'stack',
                templatePath: 'test/stack',
                metadata: {
                    'stack/vpc': { stackPath: 'stack', id: 'vpc' },
                    'stack/cidr': { stackPath: 'stack', id: 'cidr' },
                    'stack/cidr2': { stackPath: 'stack', id: 'cidr2' },
                    'stack/other': { stackPath: 'stack', id: 'other' },
                },
                nestedStacks: {},
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
                        cidr2: {
                            id: 'cidr2',
                            path: 'stack/cidr2',
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
                            Properties: {
                                VpcId: { Ref: 'vpc' },
                            },
                        },
                        cidr2: {
                            Type: 'AWS::EC2::VPCCidrBlock',
                            Properties: {
                                VpcId: { Ref: 'vpc' },
                            },
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
        ).nodes;
    }).toThrow(/VPC vpc in stack stack already has a VPCCidrBlock/);
});

test('pulumi resource type name fallsback when fqn not available', () => {
    const bucketId = 'example-bucket';
    const policyResourceId = 'Policy';
    const nodes = GraphBuilder.build(
        new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/example-bucket/Resource': { stackPath: 'stack', id: 'examplebucketC9DFA43E' },
                'stack/example-bucket/Policy/Resource': { stackPath: 'stack', id: 'examplebucketPolicyE09B485E' },
            },
            nestedStacks: {},
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
    ).nodes;

    expect(nodes[0].construct.type).toEqual('aws-cdk-lib:Stack');
    expect(nodes[1].construct.type).toEqual(bucketId);
    expect(nodes[2].construct.type).toEqual('Bucket');
    expect(nodes[3].construct.type).toEqual(policyResourceId);
    expect(nodes[4].construct.type).toEqual('BucketPolicy');
});

test('parses custom resources', () => {
    const stackManifestPath = path.join(__dirname, 'test-data/custom-resource-stack/stack-manifest.json');
    const props: StackManifestProps = JSON.parse(fs.readFileSync(stackManifestPath, 'utf-8'));
    const stackManifest = new StackManifest(props);
    const graph = GraphBuilder.build(stackManifest);

    const deployWebsiteCR = graph.nodes.find((node) => node.resourceAddress?.id === 'DeployWebsiteCustomResourceD116527B');
    expect(deployWebsiteCR).toBeDefined();
    expect(deployWebsiteCR?.construct.type).toEqual('aws-cdk-lib:CfnResource');
    expect(deployWebsiteCR?.resource).toBeDefined();
    const deployWebsiteCRResource = deployWebsiteCR!.resource!;
    expect(deployWebsiteCRResource.Type).toEqual('Custom::CDKBucketDeployment');
    expect(deployWebsiteCRResource.Properties.ServiceToken).toEqual({
        'Fn::GetAtt': ['CustomCDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C81C01536', 'Arn'],
    });
    expect(deployWebsiteCRResource.Properties.SourceBucketNames).toEqual([
        'pulumi-cdk-stom-res-d817419f-staging-616138583583-us-west-2',
    ]);
    expect(deployWebsiteCRResource.Properties.SourceObjectKeys).toEqual([
        'a386ba9b8c0d9b386083b2f6952db278a5a0ce88f497484eb5e62172219468fd.zip',
    ]);

    const testRole = graph.nodes.find((node) => node.resourceAddress?.id === 'CustomResourceRoleAB1EF463');
    expect(testRole).toBeDefined();
    const policies = testRole?.resource?.Properties?.Policies;
    expect(policies).toBeDefined();
    expect(policies).toHaveLength(1);
    const statement = policies[0].PolicyDocument?.Statement;
    expect(statement).toBeDefined();
    expect(statement).toHaveLength(1);
    expect(statement[0].Resource).toEqual({
        'Fn::Join': ['', [{ 'Fn::GetAtt': ['DeployWebsiteCustomResourceD116527B', 'DestinationBucketArn'] }, '/*']],
    });
});

test('validates that all resources are mapped', () => {
    const stackManifestPath = path.join(__dirname, 'test-data/custom-resource-stack/stack-manifest.json');
    const props: StackManifestProps = JSON.parse(fs.readFileSync(stackManifestPath, 'utf-8'));
    const metadata = props.metadata;
    const resourceToDelete = 's3deployment/WebsiteBucket/Resource';
    delete metadata[resourceToDelete];

    const deleteResourceFromTree = (tree: ConstructTree, path: string): ConstructTree => {
        if (tree.children) {
            tree.children = Object.fromEntries(
                Object.entries(tree.children)
                    .filter(([_, value]) => value.path !== path)
                    .map(([key, value]) => [key, deleteResourceFromTree(value, path)])
            );
        }
        return tree;
    }
    const constructTree = deleteResourceFromTree(props.tree, resourceToDelete);
    const stackManifest = new StackManifest({ ...props, tree: constructTree, metadata });

    expect(() => GraphBuilder.build(stackManifest)).toThrow('1 out of 11 CDK resources failed to map to Pulumi resources.');
});

function edgesToArray(edges: Set<GraphNode>): string[] {
    return Array.from(edges).flatMap((value) => value.construct.path);
}
