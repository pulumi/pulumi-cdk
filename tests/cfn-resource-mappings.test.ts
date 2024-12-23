import { mapToCfnResource } from '../src/cfn-resource-mappings';
import * as aws from '@pulumi/aws-native';

class MockResource {
    constructor(args: { [key: string]: any }) {
        Object.assign(this, args);
    }
}
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
        ecr: {
            Repository: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
        apprunner: {
            Service: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
        ecs: {
            Cluster: jest.fn().mockImplementation(() => {
                return {};
            }),
            TaskDefinition: jest.fn().mockImplementation(() => {
                return {};
            }),
            Service: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
        ec2: {
            Vpc: jest.fn().mockImplementation(() => {
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
        apigateway: {
            Model: jest.fn().mockImplementation((name: string, args: any) => {
                return new MockResource(args);
            }),
            Resource: jest.fn().mockImplementation((name: string, args: any) => {
                return new MockResource(args);
            }),
            Deployment: jest.fn().mockImplementation((name: string, args: any) => {
                return new MockResource(args);
            }),
            Stage: jest.fn().mockImplementation((name: string, args: any) => {
                return new MockResource(args);
            }),
            Authorizer: jest.fn().mockImplementation((name: string, args: any) => {
                return new MockResource(args);
            }),
        },
    };
});
afterAll(() => {
    jest.resetAllMocks();
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('Cfn Resource Mappings', () => {
    test('lowercase s3.Bucket name', () => {
        // GIVEN
        const cfnType = 'AWS::S3::Bucket';
        const logicalId = 'My-resource';
        const cfnProps = {};
        // WHEN
        mapToCfnResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.s3.Bucket).toHaveBeenCalledWith('my-resource', {}, {});
    });

    test('lowercase ecr.Repository name', () => {
        // GIVEN
        const cfnType = 'AWS::ECR::Repository';
        const logicalId = 'My-resource';
        const cfnProps = {};
        // WHEN
        mapToCfnResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.ecr.Repository).toHaveBeenCalledWith('my-resource', {}, {});
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
        mapToCfnResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.s3objectlambda.AccessPoint).toHaveBeenCalledWith(
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
        mapToCfnResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.lambda.Function).toHaveBeenCalledWith(
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
        mapToCfnResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.iam.Role).toHaveBeenCalledWith(
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
        mapToCfnResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.s3.AccessPoint).toHaveBeenCalledWith(
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
        mapToCfnResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.ec2.Vpc).toHaveBeenCalledWith(
            logicalId,
            {
                cidrBlock: '10.0.0.0/16',
            },
            {},
        );
    });

    test('successfully maps ApiGateway Resource resource', () => {
        // GIVEN
        const logicalId = 'my-resource';
        const expected = 'abc';
        // WHEN
        const resource = mapToCfnResource(logicalId, 'AWS::ApiGateway::Resource', { resourceId: expected }, {});
        // THEN
        if (!('attributes' in resource)) {
            throw new Error('Resource does not have attributes');
        }
        expect(resource).toHaveProperty('attributes');
        expect(resource.attributes!.id).toEqual(expected);
    });

    test('successfully maps ApiGateway Model resource', () => {
        // GIVEN
        const logicalId = 'my-resource';
        const expected = 'abc';
        // WHEN
        const resource = mapToCfnResource(logicalId, 'AWS::ApiGateway::Model', { name: expected }, {});
        // THEN
        if (!('attributes' in resource)) {
            throw new Error('Resource does not have attributes');
        }
        expect(resource).toHaveProperty('attributes');
        expect(resource.attributes!.id).toEqual(expected);
    });

    test('successfully maps resource attributes', () => {
        // GIVEN
        const logicalId = 'my-resource';
        const expected = 'abc';
        // WHEN
        const resource = mapToCfnResource(
            logicalId,
            'AWS::ApiGateway::Stage',
            {
                stageName: expected,
                someAttribute: 'value',
                someOtherAttribute: 'value',
            },
            {},
        );
        // THEN
        if (!('attributes' in resource)) {
            throw new Error('Resource does not have attributes');
        }
        expect(resource).toHaveProperty('attributes');
        expect(resource.attributes).toEqual({
            id: expected,
            someAttribute: 'value',
            someOtherAttribute: 'value',
            stageName: expected,
        });
    });

    test.each([
        ['AWS::AppRunner::Service', aws.apprunner.Service],
        ['AWS::ECS::Cluster', aws.ecs.Cluster],
        ['AWS::ECS::TaskDefinition', aws.ecs.TaskDefinition],
    ])('successfully maps %p to %p', (cfnType, called) => {
        // GIVEN
        const logicalId = 'my-resource';
        const cfnProps = {};

        // WHEN
        mapToCfnResource(logicalId, cfnType, cfnProps, {});

        // THEN
        expect(called).toHaveBeenCalledWith(logicalId, {}, {});
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
        mapToCfnResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.ecs.Service).toHaveBeenCalledWith(
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

    test('throws an error if module not supported', () => {
        // GIVEN
        const cfnType = 'AWS::Not::Supported';
        const logicalId = 'my-resource';
        const cfnProps = {};
        // WHEN
        expect(() => mapToCfnResource(logicalId, cfnType, cfnProps, {})).toThrow(
            /Resource type 'AWS::Not::Supported' is not supported by AWS Cloud Control./,
        );
    });

    test('throws an error if resource not supported', () => {
        // GIVEN
        const cfnType = 'AWS::S3::NotSupported';
        const logicalId = 'my-resource';
        const cfnProps = {};
        // WHEN
        expect(() => mapToCfnResource(logicalId, cfnType, cfnProps, {})).toThrow(
            /Resource type 'AWS::S3::NotSupported' is not supported by AWS Cloud Control./,
        );
    });
});
