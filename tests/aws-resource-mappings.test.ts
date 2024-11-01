import { CfnResource, Stack } from 'aws-cdk-lib/core';
import { mapToAwsResource } from '../src/aws-resource-mappings';
import * as aws from '@pulumi/aws';

jest.mock('@pulumi/aws', () => {
    return {
        apigatewayv2: {
            Integration: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
        sqs: {
            QueuePolicy: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
        sns: {
            TopicPolicy: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
        iam: {
            Policy: jest.fn().mockImplementation(() => {
                return {};
            }),
            UserPolicyAttachment: jest.fn().mockImplementation(() => {
                return {};
            }),
            RolePolicyAttachment: jest.fn().mockImplementation(() => {
                return {};
            }),
            GroupPolicyAttachment: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
    };
});

afterEach(() => {
    jest.resetAllMocks();
});

beforeAll(() => {});

describe('AWS Resource Mappings', () => {
    test('maps iam.Policy', () => {
        // GIVEN
        const cfnType = 'AWS::IAM::Policy';
        const logicalId = 'my-resource';
        const cfnProps = {
            PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Action: ['cloudformation:Describe*', 'cloudformation:List*', 'cloudformation:Get*'],
                        Resource: '*',
                    },
                ],
            },
            Groups: ['my-group'],
            Roles: ['my-role'],
            Users: ['my-user'],
        };
        // WHEN
        mapToAwsResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.iam.Policy).toHaveBeenCalledWith(
            logicalId,
            expect.objectContaining({
                policy: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Action: ['cloudformation:Describe*', 'cloudformation:List*', 'cloudformation:Get*'],
                            Resource: '*',
                        },
                    ],
                },
            }),
            {},
        );
        expect(aws.iam.GroupPolicyAttachment).toHaveBeenCalledWith(
            `${logicalId}-0`,
            expect.objectContaining({
                group: 'my-group',
                policyArn: undefined,
            }),
            {},
        );
        expect(aws.iam.RolePolicyAttachment).toHaveBeenCalledWith(
            `${logicalId}-0`,
            expect.objectContaining({
                role: 'my-role',
                policyArn: undefined,
            }),
            {},
        );
        expect(aws.iam.UserPolicyAttachment).toHaveBeenCalledWith(
            `${logicalId}-0`,
            expect.objectContaining({
                user: 'my-user',
                policyArn: undefined,
            }),
            {},
        );
    });

    test('maps sns.TopicPolicy', () => {
        // GIVEN
        const cfnType = 'AWS::SNS::TopicPolicy';
        const logicalId = 'my-resource';
        const cfnProps = {
            PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Action: ['sns:*'],
                        Resource: '*',
                    },
                ],
            },
            Topics: ['my-topic', 'my-other-topic'],
        };

        // WHEN
        mapToAwsResource(logicalId, cfnType, cfnProps, {});

        // THEN
        expect(aws.sns.TopicPolicy).toHaveBeenCalledTimes(2);
        expect(aws.sns.TopicPolicy).toHaveBeenCalledWith(
            logicalId,
            expect.objectContaining({
                arn: 'my-topic',
                policy: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Action: ['sns:*'],
                            Resource: '*',
                        },
                    ],
                },
            }),
        );
        expect(aws.sns.TopicPolicy).toHaveBeenCalledWith(
            `${logicalId}-policy-1`,
            expect.objectContaining({
                arn: 'my-other-topic',
                policy: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Action: ['sns:*'],
                            Resource: '*',
                        },
                    ],
                },
            }),
        );
    });

    test('maps sqs.QueuePolicy', () => {
        // GIVEN
        const cfnType = 'AWS::SQS::QueuePolicy';
        const logicalId = 'my-resource';
        const cfnProps = {
            Queues: ['my-queue', 'my-other-queue'],
            PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Action: ['sqs:*'],
                        Resource: '*',
                    },
                ],
            },
        };

        // WHEN
        mapToAwsResource(logicalId, cfnType, cfnProps, {});

        // THEN
        expect(aws.sqs.QueuePolicy).toHaveBeenCalledTimes(2);
        expect(aws.sqs.QueuePolicy).toHaveBeenCalledWith(
            logicalId,
            expect.objectContaining({
                queueUrl: 'my-queue',
                policy: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Action: ['sqs:*'],
                            Resource: '*',
                        },
                    ],
                },
            }),
        );

        expect(aws.sqs.QueuePolicy).toHaveBeenCalledWith(
            `${logicalId}-policy-1`,
            expect.objectContaining({
                queueUrl: 'my-other-queue',
                policy: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Action: ['sqs:*'],
                            Resource: '*',
                        },
                    ],
                },
            }),
        );
    });

    test('maps apigatewayv2.Integration', () => {
        // GIVEN
        const cfnType = 'AWS::ApiGatewayV2::Integration';
        const logicalId = 'my-resource';
        const cfnProps = {
            Description: 'Lambda Integration',
            IntegrationType: 'AWS_PROXY',
            RequestParameters: {
                'append:header.header1': '$context.requestId',
            },
            ResponseParameters: {
                '200': {
                    ResponseParameters: [
                        {
                            Source: 'headervalue',
                            Destination: 'append:header.header2',
                        },
                    ],
                },
            },
            TlsConfig: { ServerNameToVerify: 'example.com' },
        };
        // WHEN
        mapToAwsResource(logicalId, cfnType, cfnProps, {});
        // THEN
        expect(aws.apigatewayv2.Integration).toHaveBeenCalledWith(
            logicalId,
            expect.objectContaining({
                description: 'Lambda Integration',
                integrationType: 'AWS_PROXY',
                requestParameters: {
                    'append:header.header1': '$context.requestId',
                },
                responseParameters: {
                    '200': {
                        ResponseParameters: [
                            {
                                Source: 'headervalue',
                                Destination: 'append:header.header2',
                            },
                        ],
                    },
                },
                tlsConfig: { insecureSkipVerification: true },
            }),
            {},
        );
    });
});
