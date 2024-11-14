import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

class S3DeploymentStack extends pulumicdk.Stack {
    bucketWebsiteUrl: pulumi.Output<string>;
    bucketObjectKeys: pulumi.Output<string[]>;

    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);

        const bucket = new s3.Bucket(this, 'WebsiteBucket', {
            websiteIndexDocument: 'index.html',
            publicReadAccess: true,
            blockPublicAccess: {
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false,
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });


        this.bucketWebsiteUrl = this.asOutput(bucket.bucketWebsiteUrl);

        const deploy = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
            sources: [s3deploy.Source.data('index.html', 'Hello, World!')],
            destinationBucket: bucket,
        });

        this.bucketObjectKeys = this.asOutput(deploy.objectKeys);
    }
}


const cfg = new pulumi.Config();
const accountId = cfg.require('accountId');

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new S3DeploymentStack(scope, 's3deployment', {
                // configure the environment to prevent the bucket from using the unsupported FindInMap intrinsic (TODO[pulumi/pulumi-cdk#187])
                props: {
                    env: {
                        account: accountId,
                        region: process.env.AWS_REGION,
                    }
                }
            });
            return {
                bucketWebsiteUrl: stack.bucketWebsiteUrl,
                bucketObjectKeys: stack.bucketObjectKeys
            };
        });
    }
}

const app = new MyApp();
export const websiteUrl = app.outputs['bucketWebsiteUrl'];
export const objectKeys = app.outputs['bucketObjectKeys'];
