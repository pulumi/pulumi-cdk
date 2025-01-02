import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_sub from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as pulumicdk from '@pulumi/cdk';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as pulumi from '@pulumi/pulumi';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class TheBigFanStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string) {
        super(app, id);
        this.node.setContext('@aws-cdk/aws-apigateway:disableCloudWatchRole', 'true');

        /**
         * SNS Topic Creation
         * Our API Gateway posts messages directly to this
         */
        const topic = new sns.Topic(this, 'topic', {
            displayName: 'The Big Fan CDK Pattern Topic',
        });

        /**
         * SQS Subscribers creation for our SNS Topic
         * 2 subscribers, one for messages with a status of created one for any other message
         */

        // Status:created SNS Subscriber Queue
        const createdStatusQueue = new sqs.Queue(this, 'status-created-queue', {
            visibilityTimeout: cdk.Duration.seconds(300),
        });

        // Only send messages to our createdStatusQueue with a status of created
        topic.addSubscription(
            new sns_sub.SqsSubscription(createdStatusQueue, {
                rawMessageDelivery: true,
                filterPolicy: {
                    status: sns.SubscriptionFilter.stringFilter({
                        allowlist: ['created'],
                    }),
                },
            }),
        );

        // Any other status SNS Subscriber Queue
        const anyOtherStatusQueue = new sqs.Queue(this, 'other-status-queue', {
            visibilityTimeout: cdk.Duration.seconds(300),
        });

        // Only send messages to our anyOtherStatusQueue that do not have a status of created
        topic.addSubscription(
            new sns_sub.SqsSubscription(anyOtherStatusQueue, {
                rawMessageDelivery: true,
                filterPolicy: {
                    status: sns.SubscriptionFilter.stringFilter({
                        denylist: ['created'],
                    }),
                },
            }),
        );

        /**
         * Creation of Lambdas that subscribe to above SQS queues
         */

        // Created status queue lambda
        const sqsCreatedStatusSubscribeLambda = new lambda_nodejs.NodejsFunction(this, 'status-created-handler', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            entry: path.join(__dirname, 'lambda-fns/subscribe/createdStatus.ts'),
            handler: 'createdStatus.handler',
        });
        createdStatusQueue.grantConsumeMessages(sqsCreatedStatusSubscribeLambda);
        sqsCreatedStatusSubscribeLambda.addEventSource(new SqsEventSource(createdStatusQueue, {}));

        // Any other status queue lambda
        const sqsAnyOtherStatusSubscribeLambda = new lambda_nodejs.NodejsFunction(this, 'other-status-handler', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            entry: path.join(__dirname, 'lambda-fns/subscribe/anyOtherStatus.ts'),
            handler: 'anyOtherStatus.handler',
        });
        anyOtherStatusQueue.grantConsumeMessages(sqsAnyOtherStatusSubscribeLambda);
        sqsAnyOtherStatusSubscribeLambda.addEventSource(new SqsEventSource(anyOtherStatusQueue, {}));

        /**
         * API Gateway Creation
         * This is complicated because it transforms the incoming json payload into a query string url
         * this url is used to post the payload to sns without a lambda inbetween
         */
        const gateway = new apigw.RestApi(this, 'theBigFanAPI', {
            deployOptions: {
                stageName: 'prod',
            },
        });

        //Give our gateway permissions to interact with SNS
        const apigwSnsRole = new iam.Role(this, 'DefaultLambdaHanderRole', {
            assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
        });
        topic.grantPublish(apigwSnsRole);

        //Because this isn't a proxy integration, we need to define our response model
        const responseModel = gateway.addModel('ResponseModel', {
            contentType: 'application/json',
            modelName: 'ResponseModel',
            schema: {
                schema: apigw.JsonSchemaVersion.DRAFT4,
                title: 'pollResponse',
                type: apigw.JsonSchemaType.OBJECT,
                properties: { message: { type: apigw.JsonSchemaType.STRING } },
            },
        });

        // We define the JSON Schema for the transformed error response
        const errorResponseModel = gateway.addModel('ErrorResponseModel', {
            contentType: 'application/json',
            modelName: 'ErrorResponseModel',
            schema: {
                schema: apigw.JsonSchemaVersion.DRAFT4,
                title: 'errorResponse',
                type: apigw.JsonSchemaType.OBJECT,
                properties: {
                    state: { type: apigw.JsonSchemaType.STRING },
                    message: { type: apigw.JsonSchemaType.STRING },
                },
            },
        });

        //Create an endpoint '/InsertItem' which accepts a JSON payload on a POST verb
        gateway.root.addResource('SendEvent').addMethod(
            'POST',
            new apigw.Integration({
                type: apigw.IntegrationType.AWS, //native aws integration
                integrationHttpMethod: 'POST',
                uri: 'arn:aws:apigateway:us-east-1:sns:path//', // This is how we setup an SNS Topic publish operation.
                options: {
                    credentialsRole: apigwSnsRole,
                    requestParameters: {
                        'integration.request.header.Content-Type': "'application/x-www-form-urlencoded'", // Tell api gw to send our payload as query params
                    },
                    requestTemplates: {
                        // This is the VTL to transform our incoming request to post to our SNS topic
                        // Check: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html
                        'application/json':
                            'Action=Publish&' +
                            "TargetArn=$util.urlEncode('" +
                            topic.topicArn +
                            "')&" +
                            "Message=$util.urlEncode($input.path('$.message'))&" +
                            'Version=2010-03-31&' +
                            'MessageAttributes.entry.1.Name=status&' +
                            'MessageAttributes.entry.1.Value.DataType=String&' +
                            "MessageAttributes.entry.1.Value.StringValue=$util.urlEncode($input.path('$.status'))",
                    },
                    passthroughBehavior: apigw.PassthroughBehavior.NEVER,
                    integrationResponses: [
                        {
                            // Tells APIGW which response to use based on the returned code from the service
                            statusCode: '200',
                            responseTemplates: {
                                // Just respond with a generic message
                                // Check https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html
                                'application/json': JSON.stringify({ message: 'message added to topic' }),
                            },
                        },
                        {
                            // For errors, we check if the response contains the words BadRequest
                            selectionPattern: '^[Error].*',
                            statusCode: '400',
                            responseTemplates: {
                                'application/json': JSON.stringify({
                                    state: 'error',
                                    message: "$util.escapeJavaScript($input.path('$.errorMessage'))",
                                }),
                            },
                            responseParameters: {
                                'method.response.header.Content-Type': "'application/json'",
                                'method.response.header.Access-Control-Allow-Origin': "'*'",
                                'method.response.header.Access-Control-Allow-Credentials': "'true'",
                            },
                        },
                    ],
                },
            }),
            {
                methodResponses: [
                    //We need to define what models are allowed on our method response
                    {
                        // Successful response from the integration
                        statusCode: '200',
                        // Define what parameters are allowed or not
                        responseParameters: {
                            'method.response.header.Content-Type': true,
                            'method.response.header.Access-Control-Allow-Origin': true,
                            'method.response.header.Access-Control-Allow-Credentials': true,
                        },
                        // Validate the schema on the response
                        responseModels: {
                            'application/json': responseModel,
                        },
                    },
                    {
                        // Same thing for the error responses
                        statusCode: '400',
                        responseParameters: {
                            'method.response.header.Content-Type': true,
                            'method.response.header.Access-Control-Allow-Origin': true,
                            'method.response.header.Access-Control-Allow-Credentials': true,
                        },
                        responseModels: {
                            'application/json': errorResponseModel,
                        },
                    },
                ],
            },
        );
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new TheBigFanStack(scope, `${prefix}-big-fan`);
});
