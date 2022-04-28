import * as pulumicdk from '@pulumi/cdk';
import { S3ObjectLambdaStack } from './lib/s3-object-lambda-stack';

const s = new S3ObjectLambdaStack('stack');
export default s.outputs;
