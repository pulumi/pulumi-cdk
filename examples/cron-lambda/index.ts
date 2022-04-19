import * as fs from 'fs';
import * as aws_events from 'aws-cdk-lib/aws-events';
import * as aws_events_targets from 'aws-cdk-lib/aws-events-targets';
import * as aws_lambda from 'aws-cdk-lib/aws-lambda';
import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import * as pulumicdk from '@pulumi/cdk';
import { Construct } from 'constructs';
import { remapCloudControlResource } from './adapter';

class LambdaStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        // Use the AWS CDK Lambda Function API directly.
        const lambdaFn = new aws_lambda.Function(this, 'lambda', {
            code: new aws_lambda.InlineCode(fs.readFileSync('lambda-handler.py', { encoding: 'utf-8' })),
            handler: 'index.main',
            timeout: Duration.seconds(300),
            runtime: aws_lambda.Runtime.PYTHON_3_6,
        });

        // Use the AWS CDK Rule API directly.
        const rule = new aws_events.Rule(this, 'rule', {
            // Run 6:00 PM UTC every Monday through Friday
            schedule: aws_events.Schedule.expression('cron(0 18 ? * MON-FRI *)'),
        });

        // Use the AWS CDK to add a Rule target to trigger the Function.
        rule.addTarget(new aws_events_targets.LambdaFunction(lambdaFn));

        // Register a CDK Output for the Lambda functionArn so that it can be retreived from Pulumi.
        new CfnOutput(this, 'lambdaArn', { value: lambdaFn.functionArn });
    }
}

const stack = new pulumicdk.Stack('teststack', LambdaStack, { remapCloudControlResource });
export const lambdaArn = stack.outputs.lambdaArn;
