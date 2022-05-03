import { CfnElement } from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as aws from '@pulumi/aws';
import { debug } from '@pulumi/pulumi/log';

export function remapCloudControlResource(
    element: CfnElement,
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
): pulumi.CustomResource | undefined {
    switch (typeName) {
        case 'AWS::ApplicationAutoScaling::ScalingPolicy':
            debug(`AWS::ApplicationAutoScaling::ScalingPolicy props: ${JSON.stringify(props)}`);
            return new aws.appautoscaling.Policy(logicalId,
                {
                    resourceId: props.resourceId ?? props.scalingTargetId,
                    scalableDimension: props.scalableDimension ?? "ecs:service:DesiredCount",
                    serviceNamespace: props.serviceNamespace ?? "ecs",
                    policyType: props.policyType,
                    stepScalingPolicyConfiguration: props.stepScalingPolicyConfiguration,
                    name: props.policyName,
                    targetTrackingScalingPolicyConfiguration: props.targetTrackingScalingPolicyConfiguration,
                },
                options,
            );
        default:
            return undefined;
    }
}