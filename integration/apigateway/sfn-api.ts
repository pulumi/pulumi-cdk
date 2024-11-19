import { Construct } from 'constructs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as apigw from 'aws-cdk-lib/aws-apigateway';

export class SfnApi extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);
        const passTask = new sfn.Pass(this, 'PassTask', {
            result: { value: 'Hello' },
        });

        const stateMachine = new sfn.StateMachine(this, 'StateMachine', {
            definition: passTask,
            stateMachineType: sfn.StateMachineType.EXPRESS,
        });

        const api = new apigw.StepFunctionsRestApi(this, 'StepFunctionsRestApi', {
            deploy: false,
            stateMachine: stateMachine,
            headers: true,
            path: false,
            querystring: false,
            requestContext: {
                accountId: true,
                userArn: true,
            },
        });

        api.addGatewayResponse('test-response', {
            type: apigw.ResponseType.ACCESS_DENIED,
        });

        api.deploymentStage = new apigw.Stage(this, 'stage', {
            deployment: new apigw.Deployment(this, 'deployment', {
                api,
            }),
        });
    }
}
