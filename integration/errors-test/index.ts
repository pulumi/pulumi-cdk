import * as aws from '@pulumi/aws';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as pulumicdk from '@pulumi/cdk';

class ErrorsStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        const eventBus = new events.EventBus(this, 'testbus');
        // This will fail because the `sid` property is required
        eventBus.addToResourcePolicy(
            new iam.PolicyStatement({
                actions: ['events:PutEvents'],
                principals: [new iam.AccountRootPrincipal()],
                resources: [eventBus.eventBusArn],
            }),
        );
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new ErrorsStack(scope, 'teststack');
});
