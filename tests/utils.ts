import { StackManifest } from '../src/assembly';
import { CloudFormationMapping } from '../src/cfn';

export interface CreateStackManifestProps {
    resource1Props?: any;
    resource2Props: any;
    resource1DependsOn?: string | string[];
    resource2DependsOn?: string | string[];
    mappings?: CloudFormationMapping;
}

export function createStackManifest(props: CreateStackManifestProps): StackManifest {
    return new StackManifest({
        id: 'stack',
        templatePath: 'template',
        metadata: {
            'stack/resource-1': { stackPath: 'stack', id: 'resource1' },
            'stack/resource-2': { stackPath: 'stack', id: 'resource2' },
        },
        tree: {
            path: 'stack',
            id: 'stack',
            children: {
                'resource-1': {
                    id: 'resource-1',
                    path: 'stack/resource-1',
                    attributes: {
                        'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                    },
                },
                'resource-2': {
                    id: 'resource-2',
                    path: 'stack/resource-2',
                    attributes: {
                        'aws:cdk:cloudformation:type': 'AWS::S3::BucketPolicy',
                    },
                },
            },
        },
        nestedStacks: {},
        template: {
            Mappings: props.mappings,
            Resources: {
                resource1: {
                    Type: 'AWS::S3::Bucket',
                    Properties: props.resource1Props ?? {},
                    DependsOn: props.resource1DependsOn,
                },
                resource2: {
                    Type: 'AWS::S3::BucketPolicy',
                    Properties: {
                        policyDocument: {},
                        ...props.resource2Props,
                    },
                    DependsOn: props.resource2DependsOn,
                },
            },
        },
        dependencies: [],
    });
}

export interface NestedStackManifestProps {
    nestedResourceProps?: any;
    outputResourceProps?: any;
    nestedStackResourceProps?: any;
    nestedStackOutputs?: any;
    nestedStackProperties?: any;
    nestedStackParameters?: any;
}

export function createNestedStackManifest(props: NestedStackManifestProps): StackManifest {
    return new StackManifest({
        id: 'stack',
        templatePath: 'test/stack',
        metadata: {
            'stack/example-bucket/Resource': { stackPath: 'stack', id: 'parent' },
            'stack/example-bucket/Policy/Resource': { stackPath: 'stack', id: 'parentPolicy' },
            'stack/nested.NestedStack/nested.NestedStackResource': { stackPath: 'stack', id: 'nested.NestedStackResource' },
            'stack/nested/example-bucket/Resource': { stackPath: 'stack/nested', id: 'child' },
            'stack/nested/example-bucket/Policy/Resource': { stackPath: 'stack/nested', id: 'childPolicy' },
            'stack/output-bucket/Resource': { stackPath: 'stack', id: 'output' },
            'stack/output-bucket/Policy/Resource': { stackPath: 'stack', id: 'outputPolicy' },
        },
        nestedStacks: {
            'stack/nested': {
                logicalId: 'nested.NestedStack',
                Resources: {
                    child: {
                        Type: 'AWS::S3::Bucket',
                        Properties: props.nestedResourceProps,
                    },
                    childPolicy: {
                        Type: 'AWS::S3::BucketPolicy',
                        Properties: {
                            Bucket: {
                                Ref: 'child',
                            },
                        },
                    },
                },
                Outputs: props.nestedStackOutputs,
                Parameters: props.nestedStackParameters,
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
                parent: {
                    Type: 'AWS::S3::Bucket',
                    Properties: {},
                },
                parentPolicy: {
                    Type: 'AWS::S3::BucketPolicy',
                    Properties: {
                        Bucket: {
                            Ref: 'parent',
                        },
                    },
                },
                "nested.NestedStackResource": {
                    Type: 'AWS::CloudFormation::Stack',
                    Properties: props.nestedStackResourceProps,
                },
                output: {
                    Type: 'AWS::S3::Bucket',
                    Properties: props.outputResourceProps
                },
                outputPolicy: {
                    Type: 'AWS::S3::BucketPolicy',
                    Properties: {
                        Bucket: {
                            Ref: 'output',
                        },
                    },
                },
            },
        },
        dependencies: [],
    });
}
