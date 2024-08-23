import { CfnElement } from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as aws from '@pulumi/aws';

interface target {
    arn: pulumi.Input<string>;
    id: string;
}

export function remapCloudControlResource(
    _element: CfnElement,
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
): pulumi.CustomResource | undefined {
    const props = pulumicdk.interop.normalize(rawProps);
    switch (typeName) {
        case 'AWS::Events::Rule': {
            const rule = new aws.cloudwatch.EventRule(
                logicalId,
                {
                    scheduleExpression: props['scheduleExpression'],
                    isEnabled: props['state'] == 'ENABLED' ? true : props.State === 'DISABLED' ? false : undefined,
                    description: props.Description,
                    eventBusName: props['eventBusName'] ?? undefined,
                    eventPattern: props['eventPattern'] ?? undefined,
                    roleArn: props['roleArn'] ?? undefined,
                },
                options,
            );
            const targets: target[] = props['targets'] ?? [];
            for (const t of targets) {
                new aws.cloudwatch.EventTarget(
                    t.id,
                    {
                        arn: t.arn,
                        rule: rule.name,
                    },
                    options,
                );
            }
            return rule;
        }
        case 'AWS::Lambda::Permission':
            return new aws.lambda.Permission(
                logicalId,
                {
                    action: props['action'],
                    function: props['functionName'],
                    principal: props['principal'],
                    sourceArn: props['sourceArn'] ?? undefined,
                },
                options,
            );
    }

    return undefined;
}
