import { CfnResource, Stack } from 'aws-cdk-lib/core';
import { mapToAwsResource } from '../src/aws-resource-mappings';
import { setMocks } from './mocks';
import * as aws from '@pulumi/aws';

jest.mock('@pulumi/aws', () => {
    return {
        autoscaling: {
            Group: jest.fn().mockImplementation(() => {
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

describe('AWS Resource Mappings', () => {
    test('maps autoscaling.Group props', () => {
        // GIVEN
        const cfnType = 'AWS::AutoScaling::AutoScalingGroup';
        const logicalId = 'my-resource';
        const cfnProps = {
            TargetGroupARNs: ['arn'],
            VPCZoneIdentifier: ['ids'],
        };
        // WHEN
        mapToAwsResource(
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
        expect(aws.autoscaling.Group).toHaveBeenCalledWith(
            logicalId,
            expect.objectContaining({
                targetGroupArns: ['arn'],
                vpcZoneIdentifiers: ['ids'],
            }),
            {},
        );
    });
});
