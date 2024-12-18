import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as core from 'aws-cdk-lib/core';
import { Construct } from "constructs";

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as pulumiaws from '@pulumi/aws';

export interface NestedStackProps extends core.NestedStackProps {
    parentBucket: s3.Bucket;
}

class Nesty extends core.NestedStack {
    public readonly bucket: s3.Bucket;
    constructor(scope: Construct, id: string, props: NestedStackProps) {
        super(scope, id, props);
        this.bucket = new s3.Bucket(this, "bucket", {
            bucketName: props.parentBucket.bucketName + "-nested",
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
    }
}

class RootStack extends pulumicdk.Stack {
    bucketWebsiteUrl: pulumi.Output<string>;
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);

        const bucket = new s3.Bucket(this, "bucket", {});
        const nesty = new Nesty(this, "nesty", {
            parentBucket: bucket,
        });

        const deploy = new s3deploy.BucketDeployment(this, 'DeployWebsite', {
            sources: [s3deploy.Source.data('index.html', 'Hello, World!')],
            destinationBucket: nesty.bucket,
        });

        nesty.stackName;

        this.bucketWebsiteUrl = this.asOutput(nesty.bucket.bucketWebsiteUrl);
    }
}

const accountId = pulumiaws.getCallerIdentityOutput().accountId;
const region = pulumiaws.getRegionOutput().name;


class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (_: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new RootStack(this, 'teststack');
            return {
                bucketWebsiteUrl: stack.bucketWebsiteUrl,
            };
        });
    }
}

const app = new MyApp();

export const bucketWebsiteUrl = app.outputs['bucketWebsiteUrl'];
