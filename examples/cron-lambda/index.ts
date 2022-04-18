import * as fs from "fs";
import * as aws_events from 'aws-cdk-lib/aws-events';
import * as aws_events_targets from 'aws-cdk-lib/aws-events-targets';
import * as aws_lambda from 'aws-cdk-lib/aws-lambda';
import { CfnElement, Duration } from 'aws-cdk-lib';
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { CdkStackComponent, AwsPulumiAdapter } from "@pulumi/cdk/interop-aspect";
import { Construct } from "constructs";

interface target {
    arn: pulumi.Input<string>
    id: string
}

const stack = new CdkStackComponent("teststack", (scope: Construct, parent: CdkStackComponent) => {
    class MyPulumiAdapter extends AwsPulumiAdapter {
        constructor(scope: Construct, id: string, readonly parent: CdkStackComponent) {
            super(scope, id, parent);
        }

        public remapCloudControlResource(element: CfnElement, logicalId: string, typeName: string, props: any, options: pulumi.ResourceOptions): { [key: string]: pulumi.CustomResource } | undefined {
            switch (typeName) {
                case "AWS::Events::Rule":
                    const resources: { [key: string]: pulumi.CustomResource } = {};
                    const rule = new aws.cloudwatch.EventRule(logicalId,
                        {
                            scheduleExpression: props["scheduleExpression"],
                            isEnabled: props["state"] == "ENABLED"
                            ? true
                            : props.State === "DISABLED"
                            ? false
                            : undefined,
                            description: props.Description,
                            eventBusName: props["eventBusName"] ?? undefined,
                            eventPattern: props["eventPattern"] ?? undefined,
                            roleArn: props["roleArn"] ?? undefined,
                        }, options);
                    resources[logicalId] = rule;
                    const targets: target[] = props["targets"] ?? [];
                    for (const t of targets) {
                        resources[t.id] = new aws.cloudwatch.EventTarget(t.id, { 
                            arn: t.arn,
                            rule: rule.name,
                        }, options);
                    }
                    return resources;
                case "AWS::Lambda::Permission":
                    const perm = new aws.lambda.Permission(logicalId, {
                        action: props["action"],
                        function: props["functionName"],
                        principal: props["principal"],
                        sourceArn: props["sourceArn"] ?? undefined
                    }, options);
                    return { [logicalId]: perm };
            }

            return undefined;
        }

    }
    const adapter = new MyPulumiAdapter(scope, "adapter", parent);

    const lambdaFn = new aws_lambda.Function(adapter, "lambda", {
        code: new aws_lambda.InlineCode(
            fs.readFileSync("lambda-handler.py", { encoding: "utf-8" })
        ),
        handler: "index.main",
        timeout: Duration.seconds(300),
        runtime: aws_lambda.Runtime.PYTHON_3_6,
    });

    // Run 6:00 PM UTC every Monday through Friday
    // See https://docs.aws.amazon.com/lambda/latest/dg/tutorial-scheduled-events-schedule-expressions.html
    const rule = new aws_events.Rule(adapter, "rule", {
        schedule: aws_events.Schedule.expression("cron(0 18 ? * MON-FRI *)"),
    });

    rule.addTarget(new aws_events_targets.LambdaFunction(lambdaFn));
    return adapter;
});
