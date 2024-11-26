import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { AssetCode, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Output } from '@pulumi/pulumi';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class ChatAppStack extends pulumicdk.Stack {
    public readonly url: Output<string>;
    public readonly table: Output<string>;
    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

        // initialise api
        const name = id + '-api';
        const api = new WebSocketApi(this, name, {
            routeSelectionExpression: '$request.body.action',
        });
        const table = new Table(this, `${name}-table`, {
            partitionKey: {
                name: 'connectionId',
                type: AttributeType.STRING,
            },
            readCapacity: 5,
            writeCapacity: 5,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const logs = new LogGroup(this, 'websocket-lambda-logs', {
            removalPolicy: RemovalPolicy.DESTROY,
            retention: RetentionDays.ONE_DAY,
        });
        const connectFunc = new Function(this, 'connect-lambda', {
            logGroup: logs,
            code: new AssetCode('./onconnect'),
            handler: 'app.handler',
            runtime: Runtime.NODEJS_LATEST,
            timeout: Duration.seconds(300),
            memorySize: 256,
            environment: {
                TABLE_NAME: table.tableName,
            },
        });

        table.grantReadWriteData(connectFunc);

        const disconnectFunc = new Function(this, 'disconnect-lambda', {
            logGroup: logs,
            code: new AssetCode('./ondisconnect'),
            handler: 'app.handler',
            runtime: Runtime.NODEJS_LATEST,
            timeout: Duration.seconds(300),
            memorySize: 256,
            environment: {
                TABLE_NAME: table.tableName,
            },
        });

        table.grantReadWriteData(disconnectFunc);

        const messageFunc = new Function(this, 'message-lambda', {
            logGroup: logs,
            code: new AssetCode('./sendmessage'),
            handler: 'app.handler',
            runtime: Runtime.NODEJS_LATEST,
            timeout: Duration.seconds(300),
            memorySize: 256,
            environment: {
                TABLE_NAME: table.tableName,
            },
        });
        api.grantManageConnections(messageFunc);

        table.grantReadWriteData(messageFunc);

        api.addRoute('$connect', {
            integration: new WebSocketLambdaIntegration('connect-lambda', connectFunc),
        });
        api.addRoute('$disconnect', {
            integration: new WebSocketLambdaIntegration('disconnect-lambda', disconnectFunc),
        });
        api.addRoute('sendmessage', {
            integration: new WebSocketLambdaIntegration('message-lambda', messageFunc),
        });

        const stage = new WebSocketStage(this, `${name}-stage`, {
            autoDeploy: true,
            stageName: 'dev',
            webSocketApi: api,
        });

        this.table = this.asOutput(table.tableName);
        this.url = this.asOutput(stage.url);
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new ChatAppStack(scope, `${prefix}-chat-app`);
            return {
                url: stack.url,
                table: stack.table,
            };
        });
    }
}

const app = new MyApp();
export const url = app.outputs['url'];
export const table = app.outputs['table'];
