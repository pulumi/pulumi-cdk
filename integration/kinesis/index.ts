import * as pulumi from '@pulumi/pulumi';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as pulumicdk from '@pulumi/cdk';
import { Duration } from 'aws-cdk-lib/core';

class KinesisStack extends pulumicdk.Stack {
    kinesisStreamName: pulumi.Output<string>;

    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);

        const kStream = new kinesis.Stream(this, 'MyFirstStream', {
            streamName: 'my-stream',
            shardCount: 3,
            retentionPeriod: Duration.hours(24),
        })

        this.kinesisStreamName = this.asOutput(kStream.streamName);
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new KinesisStack(scope, 'teststack');
    return {
        kinesisStreamName: stack.kinesisStreamName,
    };
});
