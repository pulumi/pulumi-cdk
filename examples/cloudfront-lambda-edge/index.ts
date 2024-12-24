import * as ccapi from '@pulumi/aws-native';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { Code, Runtime, Version } from 'aws-cdk-lib/aws-lambda';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Distribution, LambdaEdgeEventType } from 'aws-cdk-lib/aws-cloudfront';
import { S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { RemovalPolicy } from 'aws-cdk-lib';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();

interface CloudFrontAppStackProps {
    edgeFunctionArn: pulumi.Output<string>;
}

const providers = [
    new ccapi.Provider('ccapi', {
        region: 'us-east-1',
    }),
    new aws.Provider('aws', {
        region: 'us-east-1',
    }),
];

class EdgeFunctionStack extends pulumicdk.Stack {
    public versionArn: pulumi.Output<string>;
    constructor(scope: pulumicdk.App, id: string) {
        super(scope, id, {
            props: {
                env: {
                    region: 'us-east-1',
                },
            },
            providers,
        });

        const handler = new cloudfront.experimental.EdgeFunction(this, 'edge-handler', {
            runtime: Runtime.NODEJS_LATEST,
            handler: 'index.handler',
            code: Code.fromInline('export const handler = async () => { return "hello" }'),
        });

        this.versionArn = this.asOutput(handler.currentVersion.edgeArn);
    }
}

class CloudFrontAppStack extends pulumicdk.Stack {
    public cloudFrontUrl: pulumi.Output<string>;
    constructor(scope: pulumicdk.App, id: string, props: CloudFrontAppStackProps) {
        super(scope, id);

        const bucket = new Bucket(this, 'Bucket', {
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const distro = new Distribution(this, 'distro', {
            defaultBehavior: {
                origin: new S3Origin(bucket),
                edgeLambdas: [
                    {
                        eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
                        functionVersion: Version.fromVersionArn(
                            this,
                            'edge',
                            pulumicdk.asString(props.edgeFunctionArn),
                        ),
                    },
                ],
            },
        });
        this.cloudFrontUrl = this.asOutput(distro.distributionDomainName);
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const edgeStack = new EdgeFunctionStack(scope, `${prefix}-edge-function`);
            const stack = new CloudFrontAppStack(scope, `${prefix}-cloudfront-edge`, {
                edgeFunctionArn: edgeStack.versionArn,
            });
            return { url: stack.cloudFrontUrl };
        });
    }
}
const app = new MyApp();
const output = app.outputs['url'];
export const url = pulumi.interpolate`https://${output}`;
