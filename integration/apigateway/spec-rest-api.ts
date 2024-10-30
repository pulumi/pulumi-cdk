import * as lambda_nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';
import { Duration, Size } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class SpecRestApi extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const api = new apigateway.SpecRestApi(this, 'my-api', {
            apiDefinition: apigateway.ApiDefinition.fromAsset(path.join(__dirname, 'sample-definition.yaml')),
            disableExecuteApiEndpoint: true,
            minCompressionSize: Size.bytes(1024),
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
        api.root.addMethod('GET');
        api.addGatewayResponse('test-response', {
            type: apigateway.ResponseType.ACCESS_DENIED,
        });
        const authorizerFn = new lambda_nodejs.NodejsFunction(this, 'MyAuthorizerFunction', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            entry: path.join(__dirname, 'integ.token-authorizer.handler'),
        });

        const authorizer = new apigateway.TokenAuthorizer(this, 'MyAuthorizer', {
            handler: authorizerFn,
            resultsCacheTtl: Duration.minutes(10),
        });
        api.root.addMethod(
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
                authorizer,
            },
        );
    }
}
