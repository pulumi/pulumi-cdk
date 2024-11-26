import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3ObjectLambda from '@aws-cdk/aws-s3objectlambda-alpha';

export class S3ObjectLambdaStack extends pulumicdk.Stack {
    exampleBucketArn: pulumi.Output<string>;
    objectLambdaArn: pulumi.Output<string>;
    objectLambdaAccessPointArn: pulumi.Output<string>;

    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

        // Set up a bucket
        const bucket = new s3.Bucket(this, 'example-bucket', {
            accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Delegating access control to access points
        // https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points-policies.html
        bucket.addToResourcePolicy(
            new iam.PolicyStatement({
                actions: ['*'],
                principals: [new iam.AnyPrincipal()],
                resources: [bucket.bucketArn, bucket.arnForObjects('*')],
                conditions: {
                    StringEquals: {
                        's3:DataAccessPointAccount': `${cdk.Aws.ACCOUNT_ID}`,
                    },
                },
            }),
        );

        // lambda to process our objects during retrieval
        const retrieveTransformedObjectLambda = new lambda.Function(this, 'retrieveTransformedObjectLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('resources/retrieve-transformed-object-lambda'),
            environment: {
                KEY: 'Value',
            },
        });

        // Object lambda s3 access
        retrieveTransformedObjectLambda.addToRolePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                resources: ['*'],
                actions: ['s3-object-lambda:WriteGetObjectResponse'],
            }),
        );
        // Restrict Lambda to be invoked from own account
        retrieveTransformedObjectLambda.addPermission('invocationRestriction', {
            action: 'lambda:InvokeFunction',
            principal: new iam.AccountRootPrincipal(),
            sourceAccount: cdk.Aws.ACCOUNT_ID,
        });

        const objectLambdaAP = new s3ObjectLambda.AccessPoint(this, 's3-object-lambda-ap', {
            bucket,
            handler: retrieveTransformedObjectLambda,
        });

        new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
        this.exampleBucketArn = this.asOutput(bucket.bucketArn);
        this.objectLambdaArn = this.asOutput(retrieveTransformedObjectLambda.functionArn);
        this.objectLambdaAccessPointArn = this.asOutput(objectLambdaAP.accessPointArn);
    }
}
