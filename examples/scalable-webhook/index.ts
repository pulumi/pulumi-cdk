import * as path from 'path';
import * as pulumicdk from '@pulumi/cdk';
import {
    aws_apigateway as apigw,
    aws_lambda as lambda,
    aws_dynamodb as dynamodb,
    aws_sqs as sqs,
    aws_lambda_event_sources as sources,
    aws_lambda_nodejs as lambda_nodejs,
    Duration,
} from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? 'local';
class ScalableWebhookStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string) {
        super(app, id);
        this.node.setContext('@aws-cdk/aws-apigateway:disableCloudWatchRole', 'true');

        /**
         * Dynamo Setup
         * This is standing in for what is RDS on the diagram due to simpler/cheaper setup
         */
        const table = new dynamodb.TableV2(this, 'Messages', {
            partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING }, //the key being id means we squash duplicate sqs messages
            billing: dynamodb.Billing.provisioned({
                readCapacity: dynamodb.Capacity.fixed(5),
                // writeCapacity cannot be fixed
                writeCapacity: dynamodb.Capacity.autoscaled({ maxCapacity: 5 }),
            }),
        });

        /**
         * Queue Setup
         * SQS creation
         */
        const queue = new sqs.Queue(this, 'RDSPublishQueue', {
            visibilityTimeout: Duration.seconds(300),
        });

        /**
         * Lambdas
         * Both publisher and subscriber from pattern
         */

        // defines an AWS Lambda resource to publish to our queue
        const sqsPublishLambda = new lambda_nodejs.NodejsFunction(this, 'SQSPublishLambdaHandler', {
            runtime: lambda.Runtime.NODEJS_LATEST, // execution environment
            entry: path.join(__dirname, 'lambda-fns/publish/lambda.ts'),
            handler: 'lambda.handler', // file is "lambda", function is "handler"
            environment: {
                queueURL: queue.queueUrl,
            },
        });

        queue.grantSendMessages(sqsPublishLambda);

        // defines an AWS Lambda resource to pull from our queue
        const sqsSubscribeLambda = new lambda_nodejs.NodejsFunction(this, 'SQSSubscribeLambdaHandler', {
            runtime: lambda.Runtime.NODEJS_LATEST, // execution environment
            entry: path.join(__dirname, 'lambda-fns/subscribe/lambda.ts'),
            handler: 'lambda.handler', // file is "lambda", function is "handler"
            reservedConcurrentExecutions: 2, // throttle lambda to 2 concurrent invocations
            environment: {
                queueURL: queue.queueUrl,
                tableName: table.tableName,
            },
        });
        queue.grantConsumeMessages(sqsSubscribeLambda);
        sqsSubscribeLambda.addEventSource(new sources.SqsEventSource(queue, {}));
        table.grantReadWriteData(sqsSubscribeLambda);

        /**
         * API Gateway Proxy
         * Used to expose the webhook through a URL
         */

        // defines an API Gateway REST API resource backed by our "sqsPublishLambda" function.
        new apigw.LambdaRestApi(this, 'Endpoint', {
            handler: sqsPublishLambda,
        });
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new ScalableWebhookStack(scope, `${prefix}-scalable-webhook`);
});
