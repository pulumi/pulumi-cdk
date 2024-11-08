import { mapToAwsResource } from '../src/aws-resource-mappings';
import * as route53 from 'aws-cdk-lib/aws-route53';
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
        route53: {
            Record: jest.fn().mockImplementation(() => {
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
            `${logicalId}-group-0`,
            expect.objectContaining({
                group: 'my-group',
                policyArn: undefined,
            }),
            {},
        );
        expect(aws.iam.RolePolicyAttachment).toHaveBeenCalledWith(
            `${logicalId}-role-0`,
            expect.objectContaining({
                role: 'my-role',
                policyArn: undefined,
            }),
            {},
        );
        expect(aws.iam.UserPolicyAttachment).toHaveBeenCalledWith(
            `${logicalId}-user-0`,
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
            {},
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
            {},
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
            {},
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
            {},
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

    test('maps route53.Record', () => {
        // GIVEN
        const cfnType = 'AWS::Route53::RecordSet';
        const logicalId = 'my-resource';
        const cfnProps = {
            HostedZoneId: 'zone-id',
            Name: 'example.com',
            Type: 'A',
            TTL: 900,
            ResourceRecords: ['192.0.2.99'],
            AliasTarget: {
                DNSName: 'example.com',
                HostedZoneId: 'zone-id',
                EvaluateTargetHealth: true,
            },
            HealthCheckId: 'health-check-id',
            SetIdentifier: 'set-identifier',
            CidrRoutingConfig: {
                CollectionId: 'collection-id',
                LocationName: 'location-name',
            },
            Failover: 'PRIMARY',
            Weight: 1,
            GeoProximityLocation: {
                Bias: 'bias',
                AWSRegion: 'region',
                LocalZoneGroup: 'group',
                Coordinates: {
                    Latitude: 0,
                    Longitude: 0,
                },
            },
            GeoLocation: {
                ContinentCode: 'code',
                CountryCode: 'code',
                SubdivisionCode: 'code',
            },
            MultiValueAnswer: true,
        };

        // WHEN
        mapToAwsResource(logicalId, cfnType, cfnProps, {});

        // THEN
        expect(aws.route53.Record).toHaveBeenCalledWith(
            logicalId,
            expect.objectContaining({
                zoneId: 'zone-id',
                name: 'example.com',
                type: 'A',
                records: ['192.0.2.99'],
                ttl: 900,
                aliases: [
                    {
                        name: 'example.com',
                        zoneId: 'zone-id',
                        evaluateTargetHealth: true,
                    },
                ],
                healthCheckId: 'health-check-id',
                setIdentifier: 'set-identifier',
                cidrRoutingPolicy: {
                    collectionId: 'collection-id',
                    locationName: 'location-name',
                },
                failoverRoutingPolicies: [{ type: 'PRIMARY' }],
                weightedRoutingPolicies: [{ weight: 1 }],
                geoproximityRoutingPolicy: {
                    bias: 'bias',
                    awsRegion: 'region',
                    localZoneGroup: 'group',
                    coordinates: [
                        {
                            latitude: 0,
                            longitude: 0,
                        },
                    ],
                },
                geolocationRoutingPolicies: [
                    {
                        continent: 'code',
                        country: 'code',
                        subdivision: 'code',
                    },
                ],
                multivalueAnswerRoutingPolicy: true,
            }),
            {},
        );
    });
});
