import * as fs from 'fs';
import * as aws_events from 'aws-cdk-lib/aws-events';
import * as aws_events_targets from 'aws-cdk-lib/aws-events-targets';
import * as aws_lambda from 'aws-cdk-lib/aws-lambda';
import { Duration } from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class LambdaStack extends pulumicdk.Stack {
    lambdaArn: pulumi.Output<string>;

    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

        // Use the AWS CDK Lambda Function API directly.
        const lambdaFn = new aws_lambda.Function(this, 'lambda', {
            code: new aws_lambda.InlineCode(fs.readFileSync('lambda-handler.py', { encoding: 'utf-8' })),
            handler: 'index.main',
            timeout: Duration.seconds(300),
            runtime: aws_lambda.Runtime.PYTHON_3_9,
        });

        // Use the AWS CDK Rule API directly.
        const rule = new aws_events.Rule(this, 'rule', {
            // Run 6:00 PM UTC every Monday through Friday
            schedule: aws_events.Schedule.expression('cron(0 18 ? * MON-FRI *)'),
        });

        // Use the AWS CDK to add a Rule target to trigger the Function.
        rule.addTarget(new aws_events_targets.LambdaFunction(lambdaFn));

        // Export the Lambda function's ARN as an output.
        this.lambdaArn = this.asOutput(lambdaFn.functionArn);
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new LambdaStack(scope, `${prefix}-cron-lambda`);
            return { lambdaArn: stack.lambdaArn };
        });
    }
}

const app = new MyApp();
export const lambdaArn = app.outputs['lambdaArn'];
