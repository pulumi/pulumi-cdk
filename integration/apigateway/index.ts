import * as pulumicdk from '@pulumi/cdk';
import { RestApi } from './rest-api';
import { SfnApi } from './sfn-api';
import { SpecRestApi } from './spec-rest-api';
import * as pulumi from '@pulumi/pulumi';

const config = new pulumi.Config();
const prefix = config.require('prefix');
class ApiGatewayStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        this.node.setContext('@aws-cdk/aws-apigateway:disableCloudWatchRole', 'true');

        new RestApi(this, 'test-api');
        new SfnApi(this, 'test-sfn-api');
        new SpecRestApi(this, 'test-spec-api');
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new ApiGatewayStack(scope, `${prefix}-apigateway`);
});
