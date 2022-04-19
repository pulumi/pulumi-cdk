import * as fs from 'fs';
import * as aws_events from 'aws-cdk-lib/aws-events';
import * as aws_events_targets from 'aws-cdk-lib/aws-events-targets';
import * as aws_lambda from 'aws-cdk-lib/aws-lambda';
import { Duration, Stack } from 'aws-cdk-lib';
import * as pulumicdk from '@pulumi/cdk';
import { Construct } from 'constructs';
import { remapCloudControlResource } from './adapter';

class LambdaStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const lambdaFn = new aws_lambda.Function(this, 'lambda', {
            code: new aws_lambda.InlineCode(fs.readFileSync('lambda-handler.py', { encoding: 'utf-8' })),
            handler: 'index.main',
            timeout: Duration.seconds(300),
            runtime: aws_lambda.Runtime.PYTHON_3_6,
        });

        // Run 6:00 PM UTC every Monday through Friday
        // See https://docs.aws.amazon.com/lambda/latest/dg/tutorial-scheduled-events-schedule-expressions.html
        const rule = new aws_events.Rule(this, 'rule', {
            schedule: aws_events.Schedule.expression('cron(0 18 ? * MON-FRI *)'),
        });

        rule.addTarget(new aws_events_targets.LambdaFunction(lambdaFn));
    }
}

const stack = new pulumicdk.Stack('teststack', LambdaStack, { remapCloudControlResource });
