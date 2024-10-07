import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws-native';
import * as pulumicdk from '@pulumi/cdk';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3ObjectLambda from 'aws-cdk-lib/aws-s3objectlambda';

// configurable variables
const S3_ACCESS_POINT_NAME = 'example-test-ap';
const OBJECT_LAMBDA_ACCESS_POINT_NAME = 's3-object-lambda-ap';

export class S3ObjectLambdaStack extends pulumicdk.Stack {
    exampleBucketArn: pulumi.Output<string>;
    objectLambdaArn: pulumi.Output<string>;
    objectLambdaAccessPointArn: pulumi.Output<string>;
    objectLambdaAccessPointUrl: pulumi.Output<string>;

    constructor(id: string) {
        super(id);

        const accessPoint = `arn:aws:s3:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:accesspoint/${S3_ACCESS_POINT_NAME}`;

        // Set up a bucket
        const bucket = new s3.Bucket(this, 'example-bucket', {
            accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
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

        // Associate Bucket's access point with lambda get access
        const policyDoc = new iam.PolicyDocument();
        const policyStatement = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:GetObject'],
            principals: [
                new iam.ArnPrincipal(this.asOutput(retrieveTransformedObjectLambda.role?.roleArn) as unknown as string),
            ],
            resources: [this.asOutput(`${accessPoint}/object/*`) as unknown as string],
        });
        policyStatement.sid = 'AllowLambdaToUseAccessPoint';
        policyDoc.addStatements(policyStatement);

        const ap = new aws.s3.AccessPoint('exampleBucketAP', {
            // CDK property can be passed to a Pulumi resource
            bucket: this.asOutput(bucket.bucketName),
            name: S3_ACCESS_POINT_NAME,
            policy: policyDoc.toJSON(),
        });

        // Access point to receive GET request and use lambda to process objects
        const objectLambdaAP = new s3ObjectLambda.CfnAccessPoint(this, 's3ObjectLambdaAP', {
            name: OBJECT_LAMBDA_ACCESS_POINT_NAME,
            objectLambdaConfiguration: {
                // a pulumi resource property can be passed to a cdk resource
                supportingAccessPoint: pulumicdk.asString(ap.arn),
                transformationConfigurations: [
                    {
                        actions: ['GetObject'],
                        contentTransformation: {
                            AwsLambda: {
                                FunctionArn: `${retrieveTransformedObjectLambda.functionArn}`,
                            },
                        },
                    },
                ],
            },
        });

        this.exampleBucketArn = this.asOutput(bucket.bucketArn);
        this.objectLambdaArn = this.asOutput(retrieveTransformedObjectLambda.functionArn);
        this.objectLambdaAccessPointArn = this.asOutput(objectLambdaAP.attrArn);
        this.objectLambdaAccessPointUrl = this.asOutput(
            `https://console.aws.amazon.com/s3/olap/${cdk.Aws.ACCOUNT_ID}/${OBJECT_LAMBDA_ACCESS_POINT_NAME}?region=${cdk.Aws.REGION}`,
        );

        this.synth();
    }
}
