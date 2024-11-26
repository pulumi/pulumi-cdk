import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import type { AppOutputs } from '@pulumi/cdk';
import { S3ObjectLambdaStack } from './src/s3-object-lambda-stack';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? 'local';
const app = new pulumicdk.App('app', (scope: pulumicdk.App): AppOutputs => {
    const s = new S3ObjectLambdaStack(scope, `${prefix}-object-lambda`);
    return {
        exampleBucketArn: s.exampleBucketArn,
        objectLambdaArn: s.objectLambdaArn,
        objectLambdaAccessPointArn: s.objectLambdaAccessPointArn,
    };
});
export const exampleBucketArn = app.outputs['exampleBucketArn'];
export const objectLambdaArn = app.outputs['objectLambdaArn'];
export const objectLambdaAccessPointArn = app.outputs['objectLambdaAccessPointArn'];
export const bucketName = app.outputs['BucketName'];
