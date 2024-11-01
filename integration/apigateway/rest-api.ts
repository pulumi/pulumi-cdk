import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';
import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Size } from 'aws-cdk-lib/core';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class RestApi extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const vpc = new ec2.Vpc(this, 'MyVpc', {
            restrictDefaultSecurityGroup: false,
            maxAzs: 2,
            natGateways: 0,
            subnetConfiguration: [
                {
                    name: 'Private',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
        });
        const nlb1 = new elbv2.NetworkLoadBalancer(this, 'NLB1', { vpc });
        const link = new apigateway.VpcLink(this, 'link', {
            targets: [nlb1],
        });

        const vpcEndpoint = vpc.addInterfaceEndpoint('MyVpcEndpoint', {
            service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
        });
        const authorizerFn = new lambda_nodejs.NodejsFunction(this, 'MyAuthorizerFunction', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            entry: path.join(__dirname, 'authorizer.handler.ts'),
        });

        const authorizer = new apigateway.RequestAuthorizer(this, 'MyAuthorizer', {
            handler: authorizerFn,
            identitySources: [
                apigateway.IdentitySource.header('Authorization'),
                apigateway.IdentitySource.queryString('allow'),
            ],
        });

        const api = new apigateway.RestApi(this, 'my-api', {
            retainDeployments: true,
            endpointConfiguration: {
                types: [apigateway.EndpointType.PRIVATE],
                vpcEndpoints: [vpcEndpoint],
            },
            policy: new iam.PolicyDocument({
                statements: [
                    new iam.PolicyStatement({
                        principals: [new iam.AnyPrincipal()],
                        actions: ['execute-api:Invoke'],
                        effect: iam.Effect.ALLOW,
                    }),
                ],
            }),
            minCompressionSize: Size.bytes(1024),
            description: 'api description',
            deployOptions: {
                cacheClusterEnabled: true,
                stageName: 'beta',
                description: 'beta stage',
                methodOptions: {
                    '/api/appliances/GET': {
                        cachingEnabled: true,
                    },
                },
            },
        });
        const vpcIntegration = new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'ANY',
            options: {
                connectionType: apigateway.ConnectionType.VPC_LINK,
                vpcLink: link,
            },
        });
        api.root.addResource('vpc').addMethod('GET', vpcIntegration);

        new apigateway.RateLimitedApiKey(this, 'my-api-key');

        new cloudwatch.Alarm(this, 'RestApiAlarm', {
            metric: api.metricClientError(),
            evaluationPeriods: 1,
            threshold: 1,
        });

        const handler = new lambda.Function(this, 'MyHandler', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            code: lambda.Code.fromInline(`exports.handler = ${handlerCode}`),
            handler: 'index.handler',
        });

        const v1 = api.root.addResource('v1');

        const integration = new apigateway.LambdaIntegration(handler);

        const toys = v1.addResource('toys');
        const getToysMethod: apigateway.Method = toys.addMethod('GET', integration, { apiKeyRequired: true });
        toys.addMethod('POST');
        toys.addMethod('PUT');

        const appliances = v1.addResource('$appliances:all');
        appliances.addMethod('GET');

        const books = v1.addResource('books');
        books.addMethod('GET', integration);
        books.addMethod('POST', integration);

        api.root.resourceForPath('auth').addMethod(
            'ANY',
            new apigateway.MockIntegration({
                integrationResponses: [{ statusCode: '200' }],
                passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
                requestTemplates: {
                    'application/json': '{ "statusCode": 200 }',
                },
            }),
            {
                methodResponses: [{ statusCode: '200' }],
                authorizationType: apigateway.AuthorizationType.CUSTOM,
                authorizer,
            },
        );
        const userPool = new cognito.UserPool(this, 'UserPool');

        const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'myauthorizer', {
            cognitoUserPools: [userPool],
        });

        api.addRequestValidator('params-validator', {
            requestValidatorName: 'Parameters',
            validateRequestBody: false,
            validateRequestParameters: true,
        });
        api.addRequestValidator('body-validator', {
            requestValidatorName: 'Body',
            validateRequestBody: true,
            validateRequestParameters: false,
        });
        api.root.resourceForPath('cognito').addMethod(
            'GET',
            new apigateway.MockIntegration({
                integrationResponses: [{ statusCode: '200' }],
                passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
                requestTemplates: {
                    'application/json': '{ "statusCode": 200 }',
                },
            }),
            {
                methodResponses: [{ statusCode: '200' }],
                authorizer: cognitoAuthorizer,
                authorizationType: apigateway.AuthorizationType.COGNITO,
            },
        );

        function handlerCode(event: any, _: any, callback: any) {
            return callback(undefined, {
                isBase64Encoded: false,
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(event),
            });
        }

        const key = api.addApiKey('ApiKey');
        const plan = api.addUsagePlan('UsagePlan', {
            name: 'Basic',
            description: 'Free tier monthly usage plan',
            throttle: { rateLimit: 5 },
            quota: {
                limit: 10000,
                period: apigateway.Period.MONTH,
            },
        });
        plan.addApiKey(key);
        plan.addApiStage({
            stage: api.deploymentStage,
            throttle: [
                {
                    method: getToysMethod,
                    throttle: {
                        rateLimit: 10,
                        burstLimit: 2,
                    },
                },
            ],
        });

        const testDeploy = new apigateway.Deployment(this, 'TestDeployment', {
            api,
            retainDeployments: false,
        });
        const testStage = new apigateway.Stage(this, 'TestStage', {
            deployment: testDeploy,
        });
        testStage.addApiKey('MyTestApiKey');
    }
}
