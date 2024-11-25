import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as pulumicdk from '@pulumi/cdk';
import { Duration } from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';

const config = new pulumi.Config();
const prefix = config.require('prefix');
class KmsStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        const role = new iam.Role(this, 'testrole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });
        const key = new kms.Key(this, 'testkey', {
            pendingWindow: Duration.days(7),
            enableKeyRotation: false,
        });
        key.addToResourcePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['kms:Encrypt', 'kms:Decrypt'],
                resources: ['*'],
                principals: [role],
            }),
        );
        key.addAlias('pulumi');
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new KmsStack(scope, `${prefix}-kms`);
});
