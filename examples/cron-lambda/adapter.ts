import { CfnElement } from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import { Construct } from 'constructs';

interface target {
    arn: pulumi.Input<string>;
    id: string;
}

export function remapCloudControlResource(
    element: CfnElement,
    logicalId: string,
    typeName: string,
    props: any,
    options: pulumi.ResourceOptions,
): { [key: string]: pulumi.CustomResource } | undefined {
    switch (typeName) {
        case 'AWS::Events::Rule':
            const resources: { [key: string]: pulumi.CustomResource } = {};
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
            resources[logicalId] = rule;
            const targets: target[] = props['targets'] ?? [];
            for (const t of targets) {
                resources[t.id] = new aws.cloudwatch.EventTarget(
                    t.id,
                    {
                        arn: t.arn,
                        rule: rule.name,
                    },
                    options,
                );
            }
            return resources;
        case 'AWS::Lambda::Permission':
            const perm = new aws.lambda.Permission(
                logicalId,
                {
                    action: props['action'],
                    function: props['functionName'],
                    principal: props['principal'],
                    sourceArn: props['sourceArn'] ?? undefined,
                },
                options,
            );
            return { [logicalId]: perm };
    }

    return undefined;
}
