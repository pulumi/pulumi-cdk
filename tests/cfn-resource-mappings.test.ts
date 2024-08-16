import { CfnResource, Stack } from 'aws-cdk-lib/core';
import { CustomResource } from '@pulumi/pulumi';
import { mapToCfnResource } from '../src/cfn-resource-mappings';
import { setMocks } from './mocks';
import * as aws from '@pulumi/aws-native';

jest.mock('@pulumi/pulumi', () => {
    return {
        ...jest.requireActual('@pulumi/pulumi'),
        CustomResource: jest.fn().mockImplementation(() => {
            return {};
        }),
    };
});

jest.mock('@pulumi/aws-native', () => {
    return {
        s3: {
            AccessPoint: jest.fn().mockImplementation(() => {
                return {};
            }),
            Bucket: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
        iam: {
            Role: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
        lambda: {
            Function: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
        s3objectlambda: {
            AccessPoint: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
    };
});

afterEach(() => {
    jest.resetAllMocks();
});

beforeAll(() => {
    setMocks();
});

describe('Cfn Resource Mappings', () => {
    test('lowercase s3.Bucket name', () => {
        // GIVEN
        const cfnType = 'AWS::S3::Bucket';
        const logicalId = 'My-resource';
        const cfnProps = {};
        // WHEN
        mapToCfnResource(
            new CfnResource(new Stack(), logicalId, {
                type: cfnType,
                properties: cfnProps,
            }),
            logicalId,
            cfnType,
            cfnProps,
            {},
        );
        // THEN
        expect(aws.s3.Bucket).toHaveBeenCalledWith('my-resource', {}, {});
    });

    test('maps s3objectlambda.AccessPoint props', () => {
        // GIVEN
        const cfnType = 'AWS::S3ObjectLambda::AccessPoint';
        const logicalId = 'my-resource';
        const cfnProps = {
            ObjectLambdaConfiguration: {
                TransformationConfigurations: [
                    {
                        Actions: ['abc'],
                        ContentTransformation: {
                            AwsLambda: {
                                FunctionArn: 'arn',
                                FunctionPayload: '{ "Key": "value" }',
                            },
                        },
                    },
                ],
            },
        };
        // WHEN
        mapToCfnResource(
            new CfnResource(new Stack(), logicalId, {
                type: cfnType,
                properties: cfnProps,
            }),
            logicalId,
            cfnType,
            cfnProps,
            {},
        );
        // THEN
        expect(CustomResource).toHaveBeenCalledWith(
            'aws-native:s3objectlambda:AccessPoint',
            logicalId,
            {
                objectLambdaConfiguration: {
                    transformationConfigurations: [
                        {
                            actions: ['abc'],
                            contentTransformation: {
                                awsLambda: {
                                    functionArn: 'arn',
                                    functionPayload: '{ "Key": "value" }',
                                },
                            },
                        },
                    ],
                },
            },
            {},
        );
    });

    test('maps lambda.Function environment variables', () => {
        // GIVEN
        const cfnType = 'AWS::Lambda::Function';
        const logicalId = 'my-resource';
        const cfnProps = {
            Environment: {
                Variables: {
                    Key: 'Value',
                },
            },
        };
        // WHEN
        mapToCfnResource(
            new CfnResource(new Stack(), logicalId, {
                type: cfnType,
                properties: cfnProps,
            }),
            logicalId,
            cfnType,
            cfnProps,
            {},
        );
        // THEN
        expect(CustomResource).toHaveBeenCalledWith(
            'aws-native:lambda:Function',
            logicalId,
            {
                environment: {
                    variables: {
                        Key: 'Value',
                    },
                },
            },
            {},
        );
    });

    test('maps iam.Role props', () => {
        // GIVEN
        const cfnType = 'AWS::IAM::Role';
        const logicalId = 'my-resource';
        const cfnProps = {
            AssumeRolePolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Action: ['sts:AssumeRole'],
                        Effect: 'Allow',
                        Principal: {
                            Service: ['lambda.amazonaws.com'],
                        },
                    },
                ],
            },
            Description: 'desc',
            Policies: [
                {
                    PolicyName: 'root',
                    PolicyDocument: {
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Action: ['sts:AssumeRole'],
                                Effect: 'Allow',
                                Principal: {
                                    Service: ['lambda.amazonaws.com'],
                                },
                            },
                        ],
                    },
                },
            ],
        };
        // WHEN
        mapToCfnResource(
            new CfnResource(new Stack(), logicalId, {
                type: cfnType,
                properties: cfnProps,
            }),
            logicalId,
            cfnType,
            cfnProps,
            {},
        );
        // THEN
        expect(CustomResource).toHaveBeenCalledWith(
            'aws-native:iam:Role',
            logicalId,
            {
                description: 'desc',
                assumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Action: ['sts:AssumeRole'],
                            Effect: 'Allow',
                            Principal: {
                                Service: ['lambda.amazonaws.com'],
                            },
                        },
                    ],
                },
                policies: [
                    {
                        policyName: 'root',
                        policyDocument: {
                            Version: '2012-10-17',
                            Statement: [
                                {
                                    Action: ['sts:AssumeRole'],
                                    Effect: 'Allow',
                                    Principal: {
                                        Service: ['lambda.amazonaws.com'],
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
            {},
        );
    });

    test('maps s3.AccessPoint policy', () => {
        // GIVEN
        const cfnType = 'AWS::S3::AccessPoint';
        const logicalId = 'my-resource';
        const cfnProps = {
            Policy: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Action: ['s3:GetObject'],
                        Effect: 'Allow',
                        Resource: 'bucket',
                        Principal: {
                            AWS: 'aws',
                        },
                    },
                ],
            },
        };
        // WHEN
        mapToCfnResource(
            new CfnResource(new Stack(), logicalId, {
                type: cfnType,
                properties: cfnProps,
            }),
            logicalId,
            cfnType,
            cfnProps,
            {},
        );
        // THEN
        expect(CustomResource).toHaveBeenCalledWith(
            'aws-native:s3:AccessPoint',
            logicalId,
            {
                policy: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Action: ['s3:GetObject'],
                            Effect: 'Allow',
                            Resource: 'bucket',
                            Principal: {
                                AWS: 'aws',
                            },
                        },
                    ],
                },
            },
            {},
        );
    });

    test('successfully maps VPC resource', () => {
        // GIVEN
        const cfnType = 'AWS::EC2::VPC';
        const logicalId = 'my-resource';
        const cfnProps = {
            CidrBlock: '10.0.0.0/16',
        };
        // WHEN
        mapToCfnResource(
            new CfnResource(new Stack(), logicalId, {
                type: cfnType,
                properties: cfnProps,
            }),
            logicalId,
            cfnType,
            cfnProps,
            {},
        );
        // THEN
        expect(CustomResource).toHaveBeenCalledWith(
            'aws-native:ec2:Vpc',
            logicalId,
            {
                cidrBlock: '10.0.0.0/16',
            },
            {},
        );
    });
    test('successfully maps ECS Service resource', () => {
        // GIVEN
        const cfnType = 'AWS::ECS::Service';
        const logicalId = 'my-resource';
        const cfnProps = {
            Tags: [
                {
                    Key: 'key',
                    Value: 'value',
                },
            ],
            Cluster: 'clusterarn',
            LoadBalancers: [
                {
                    ContainerPort: 80,
                },
            ],
            EnableECSManagedTags: true,
        };
        // WHEN
        mapToCfnResource(
            new CfnResource(new Stack(), logicalId, {
                type: cfnType,
                properties: cfnProps,
            }),
            logicalId,
            cfnType,
            cfnProps,
            {},
        );
        // THEN
        expect(CustomResource).toHaveBeenCalledWith(
            'aws-native:ecs:Service',
            logicalId,
            {
                tags: [
                    {
                        key: 'key',
                        value: 'value',
                    },
                ],
                cluster: 'clusterarn',
                loadBalancers: [
                    {
                        containerPort: 80,
                    },
                ],
                enableEcsManagedTags: true,
            },
            {},
        );
    });
});
