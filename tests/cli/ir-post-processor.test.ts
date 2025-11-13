import { ProgramIR } from '@pulumi/cdk-convert-core';
import { postProcessProgramIr } from '../../src/cli/ir-post-processor';

function makeResource(overrides: Partial<ProgramIR['stacks'][number]['resources'][number]>) {
    return {
        logicalId: 'Resource',
        cfnType: 'AWS::Test::Resource',
        cfnProperties: {},
        typeToken: 'aws-native:test:Resource',
        props: {},
        ...overrides,
    };
}

describe('postProcessProgramIr', () => {
    test('converts API Gateway V2 Stage to aws classic type', () => {
        const program: ProgramIR = {
            stacks: [
                {
                    stackId: 'AppStack',
                    stackPath: 'App/Stack',
                    resources: [
                        makeResource({
                            logicalId: 'Stage',
                            cfnType: 'AWS::ApiGatewayV2::Stage',
                            cfnProperties: {
                                ApiId: 'api-123',
                                StageName: '$default',
                            },
                        }),
                    ],
                },
            ],
        } as any;

        const processed = postProcessProgramIr(program);
        expect(processed.stacks[0].resources).toHaveLength(1);
        expect(processed.stacks[0].resources[0]).toMatchObject({
            logicalId: 'Stage',
            typeToken: 'aws:apigatewayv2/stage:Stage',
            props: expect.objectContaining({
                apiId: 'api-123',
                name: '$default',
            }),
        });
    });

    test('expands IAM policies into attachments', () => {
        const program: ProgramIR = {
            stacks: [
                {
                    stackId: 'AppStack',
                    stackPath: 'App/Stack',
                    resources: [
                        makeResource({
                            logicalId: 'Policy',
                            cfnType: 'AWS::IAM::Policy',
                            cfnProperties: {
                                PolicyDocument: {
                                    Version: '2012-10-17',
                                },
                                Roles: ['role-arn'],
                            },
                        }),
                    ],
                },
            ],
        } as any;

        const processed = postProcessProgramIr(program);
        const stackResources = processed.stacks[0].resources;
        expect(stackResources).toHaveLength(2);
        expect(stackResources[0]).toMatchObject({
            logicalId: 'Policy',
            typeToken: 'aws:iam/policy:Policy',
        });
        expect(stackResources[1]).toMatchObject({
            logicalId: 'Policy-role-0',
            typeToken: 'aws:iam/rolePolicyAttachment:RolePolicyAttachment',
            props: expect.objectContaining({
                policyArn: expect.objectContaining({
                    attributeName: 'Arn',
                }),
                role: 'role-arn',
            }),
        });
    });

    test('rewrites custom resources to emulator when staging bucket is present', () => {
        const program: ProgramIR = {
            stacks: [
                {
                    stackId: 'StagingStack-123',
                    stackPath: 'StagingStack-123',
                    resources: [
                        makeResource({
                            logicalId: 'StagingBucket',
                            cfnType: 'AWS::S3::Bucket',
                            props: { bucketName: 'cdk-staging-bucket' },
                        }),
                    ],
                },
                {
                    stackId: 'AppStack',
                    stackPath: 'App/Stack',
                    resources: [
                        makeResource({
                            logicalId: 'CustomResource',
                            cfnType: 'Custom::Demo',
                            cfnProperties: {
                                ServiceToken: 'arn:aws:lambda:us-east-1:123:function:demo',
                            },
                        }),
                    ],
                },
            ],
        } as any;

        const processed = postProcessProgramIr(program);
        const custom = processed.stacks[1].resources[0];
        expect(custom.typeToken).toBe('aws-native:cloudformation:CustomResourceEmulator');
        expect(custom.props).toMatchObject({
            bucketName: 'cdk-staging-bucket',
            serviceToken: 'arn:aws:lambda:us-east-1:123:function:demo',
            resourceType: 'Custom::Demo',
        });
    });
});
