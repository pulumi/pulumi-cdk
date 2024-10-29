import * as path from 'path';
import * as pulumicdk from '@pulumi/cdk';
import {
    aws_apigateway as apigw,
    aws_events as events,
    aws_iam as iam,
    aws_events_targets as events_targets,
    aws_lambda as lambda,
    aws_lambda_nodejs as lambda_nodejs,
} from 'aws-cdk-lib';

class EventbridgeAtmStack extends pulumicdk.Stack {
    constructor(id: string) {
        super(id);
        this.node.setContext('@aws-cdk/aws-apigateway:disableCloudWatchRole', 'true');

        /**
         * Producer Lambda
         */
        const atmProducerLambda = new lambda_nodejs.NodejsFunction(this, 'atmProducerLambda', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            entry: path.join(__dirname, 'lambda-fns/atmProducer/handler.ts'),
            handler: 'handler.handler',
        });

        const eventPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ['*'],
            actions: ['events:PutEvents'],
        });

        atmProducerLambda.addToRolePolicy(eventPolicy);

        /**
         * Approved Transaction Consumer
         */
        const atmConsumer1Lambda = new lambda.Function(this, 'atmConsumer1Lambda', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            code: lambda.Code.fromAsset('lambda-fns/atmConsumer'),
            handler: 'handler.case1Handler',
        });

        const atmConsumer1LambdaRule = new events.Rule(this, 'atmConsumer1LambdaRule', {
            description: 'Approved transactions',
            eventPattern: {
                source: ['custom.myATMapp'],
                detailType: ['transaction'],
                detail: {
                    result: ['approved'],
                },
            },
        });

        atmConsumer1LambdaRule.addTarget(new events_targets.LambdaFunction(atmConsumer1Lambda));

        /**
         * NY Prefix Consumer
         */
        const atmConsumer2Lambda = new lambda.Function(this, 'atmConsumer2Lambda', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            code: lambda.Code.fromAsset('lambda-fns/atmConsumer'),
            handler: 'handler.case2Handler',
        });

        const atmConsumer2LambdaRule = new events.Rule(this, 'atmConsumer2LambdaRule', {
            eventPattern: {
                source: ['custom.myATMapp'],
                detailType: ['transaction'],
                detail: {
                    location: [
                        {
                            prefix: 'NY-',
                        },
                    ],
                },
            },
        });

        atmConsumer2LambdaRule.addTarget(new events_targets.LambdaFunction(atmConsumer2Lambda));

        /**
         * Not Approved Consumer
         */
        const atmConsumer3Lambda = new lambda.Function(this, 'atmConsumer3Lambda', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            code: lambda.Code.fromAsset('lambda-fns/atmConsumer'),
            handler: 'handler.case3Handler',
        });

        const atmConsumer3LambdaRule = new events.Rule(this, 'atmConsumer3LambdaRule', {
            eventPattern: {
                source: ['custom.myATMapp'],
                detailType: ['transaction'],
                detail: {
                    result: [
                        {
                            'anything-but': 'approved',
                        },
                    ],
                },
            },
        });

        atmConsumer3LambdaRule.addTarget(new events_targets.LambdaFunction(atmConsumer3Lambda));

        /**
         * API Gateway proxy integration
         */
        // defines an API Gateway REST API resource backed by our "atmProducerLambda" function.
        new apigw.LambdaRestApi(this, 'Endpoint', {
            handler: atmProducerLambda,
        });

        this.synth();
    }
}

new EventbridgeAtmStack('eventbridge-sns-stack');
