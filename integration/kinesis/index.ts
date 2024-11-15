import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as pulumicdk from '@pulumi/cdk';
import { Duration } from 'aws-cdk-lib/core';
import { aws_elasticloadbalancingv2, aws_kms, aws_route53_targets } from 'aws-cdk-lib';

class KinesisStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);

        new kinesis.Stream(this, "MyFirstStream", {
            streamName: "my-awesome-stream",
            shardCount: 3,
            retentionPeriod: Duration.hours(24),
        })
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new KinesisStack(scope, 'teststack');
});
