import * as pulumi from '@pulumi/pulumi';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as pulumicdk from '@pulumi/cdk';
import { Duration, RemovalPolicy } from 'aws-cdk-lib/core';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? 'local';
class KinesisStack extends pulumicdk.Stack {
    kinesisStreamName: pulumi.Output<string>;

    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);

        const kStream = new kinesis.Stream(this, 'my-stream', {
            shardCount: 3,
            retentionPeriod: Duration.hours(24),
            removalPolicy: RemovalPolicy.DESTROY,
        });

        this.kinesisStreamName = this.asOutput(kStream.streamName);
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new KinesisStack(scope, `${prefix}-kinesis`);
    return {
        kinesisStreamName: stack.kinesisStreamName,
    };
});

export const kinesisStreamName = app.outputs['kinesisStreamName'];
