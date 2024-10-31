import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

class S3DeploymentStack extends pulumicdk.Stack {
    bucketWebsiteUrl: pulumi.Output<string>;
    bucketObjectKeys: pulumi.Output<string[]>;

    constructor(id: string, options?: pulumicdk.StackOptions) {
        super(id, options);

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

        const role = new iam.Role(this, 'DeploymentRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"),
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
            ]
        });
        bucket.grantReadWrite(role);

        const deploy = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
            sources: [s3deploy.Source.data('index.html', 'Hello, World!')],
            destinationBucket: bucket,
            role: role,
        });

        this.bucketObjectKeys = this.asOutput(deploy.objectKeys);

        // Finalize the stack and deploy its resources.
        this.synth();
    }
}


const cfg = new pulumi.Config();
const accountId = cfg.require('accountId');
const stack = new S3DeploymentStack('s3deployment', {
    // configure the environment to prevent the bucket from using the unsupported FindInMap intrinsic
    props: {
        env: {
            account: accountId,
            region: process.env.AWS_REGION,
        }
    }
});
export const websiteUrl = stack.bucketWebsiteUrl;
export const objectKeys = stack.bucketObjectKeys;
