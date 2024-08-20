import { S3ObjectLambdaStack } from './src/s3-object-lambda-stack';

const s = new S3ObjectLambdaStack('stack');
export const exampleBucketArn = s.exampleBucketArn;
export const objectLambdaArn = s.objectLambdaArn;
export const objectLambdaAccessPointArn = s.objectLambdaAccessPointArn;
export const objectLambdaAccessPointUrl = s.objectLambdaAccessPointUrl;
