import * as pulumicdk from '@pulumi/cdk';
import { RestApi } from './rest-api';
import { SfnApi } from './sfn-api';
import { SpecRestApi } from './spec-rest-api';

class ApiGatewayStack extends pulumicdk.Stack {
    constructor(id: string, options?: pulumicdk.StackOptions) {
        super(id, options);
        this.node.setContext('@aws-cdk/aws-apigateway:disableCloudWatchRole', 'true');

        new RestApi(this, 'test-api');
        // TODO: requires https://github.com/pulumi/pulumi-cdk/issues/187
        // new SfnApi(this, 'test-sfn-api');
        new SpecRestApi(this, 'test-spec-api');
        this.synth();
    }
}

const stack = new ApiGatewayStack('teststack');
