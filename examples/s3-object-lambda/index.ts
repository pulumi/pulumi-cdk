import * as pulumicdk from '@pulumi/cdk';
import { S3ObjectLambdaStack } from './lib/s3-object-lambda-stack';

const s = new pulumicdk.Stack('stack', S3ObjectLambdaStack);
export default s.outputs;
