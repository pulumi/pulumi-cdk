import { ResourceIR, StackIR } from '@pulumi/cdk-convert-core';
import { ConversionReportBuilder } from '../../src/cli/conversion-report';

function makeStack(resources: ResourceIR[]): StackIR {
    return {
        stackId: 'TestStack',
        stackPath: 'App/TestStack',
        resources,
    } as StackIR;
}

function makeResource(logicalId: string, typeToken = 'aws-native:s3:Bucket'): ResourceIR {
    return {
        logicalId,
        cfnType: 'AWS::S3::Bucket',
        cfnProperties: {},
        typeToken,
        props: {},
    } as ResourceIR;
}

describe('ConversionReportBuilder', () => {
    test('tracks stack counts without entries', () => {
        const builder = new ConversionReportBuilder();
        const stack = makeStack([makeResource('BucketA'), makeResource('BucketB')]);
        builder.stackStarted(stack);
        builder.stackFinished(stack, 1);

        expect(builder.build()).toEqual({
            stacks: [
                {
                    stackId: 'TestStack',
                    stackPath: 'App/TestStack',
                    originalResourceCount: 2,
                    emittedResourceCount: 1,
                    entries: [],
                },
            ],
        });
    });

    test('records skipped resources, classic fallbacks, and fan-out entries', () => {
        const builder = new ConversionReportBuilder();
        const stack = makeStack([makeResource('ResourceA')]);
        const resource = makeResource('ResourceA');
        builder.stackStarted(stack);
        builder.resourceSkipped(stack, resource, 'cdkMetadata');
        builder.classicConversion(stack, resource, [
            'aws:servicediscovery/service:Service',
            'aws:servicediscovery/service:Service',
        ]);
        builder.fanOut(stack, resource, [
            makeResource('ResourceA', 'aws:iam/policy:Policy'),
            makeResource('ResourceA-attachment', 'aws:iam/rolePolicyAttachment:RolePolicyAttachment'),
        ]);
        builder.stackFinished(stack, 3);

        expect(builder.build()).toEqual({
            stacks: [
                {
                    stackId: 'TestStack',
                    stackPath: 'App/TestStack',
                    originalResourceCount: 1,
                    emittedResourceCount: 3,
                    entries: [
                        {
                            kind: 'skipped',
                            logicalId: 'ResourceA',
                            cfnType: 'AWS::S3::Bucket',
                            reason: 'cdkMetadata',
                        },
                        {
                            kind: 'classicFallback',
                            logicalId: 'ResourceA',
                            cfnType: 'AWS::S3::Bucket',
                            targetTypeTokens: ['aws:servicediscovery/service:Service'],
                        },
                        {
                            kind: 'fanOut',
                            logicalId: 'ResourceA',
                            cfnType: 'AWS::S3::Bucket',
                            emittedResources: [
                                { logicalId: 'ResourceA', typeToken: 'aws:iam/policy:Policy' },
                                {
                                    logicalId: 'ResourceA-attachment',
                                    typeToken: 'aws:iam/rolePolicyAttachment:RolePolicyAttachment',
                                },
                            ],
                        },
                    ],
                },
            ],
        });
    });
});
