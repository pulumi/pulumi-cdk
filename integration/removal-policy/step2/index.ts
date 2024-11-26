import * as s3 from 'aws-cdk-lib/aws-s3';
import * as pulumicdk from '@pulumi/cdk';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
const config = new pulumi.Config();
const bucketName = config.require('bucketName');
const prefix = config.get('prefix') ?? pulumi.getStack();

class RemovalPolicyStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        new s3.Bucket(this, 'testbucket', {
            bucketName: bucketName,
            removalPolicy: RemovalPolicy.DESTROY,
        });
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new RemovalPolicyStack(scope, `${prefix}-removal`);
});
