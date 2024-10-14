import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { Code, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import {
    Distribution,
    experimental,
    Function,
    FunctionCode,
    FunctionEventType,
    FunctionRuntime,
    KeyValueStore,
    LambdaEdgeEventType,
} from 'aws-cdk-lib/aws-cloudfront';
import { FunctionUrlOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';

class CloudFrontAppStack extends pulumicdk.Stack {
    public cloudFrontUrl: pulumi.Output<string>;
    constructor(id: string) {
        super(id);

        const handler = new NodejsFunction(this, 'handler', {
            runtime: Runtime.NODEJS_LATEST,
        });

        const cfFunction = new Function(this, 'CfFunction', {
            code: FunctionCode.fromInline('export function handler(event) { return event.request }'),
            runtime: FunctionRuntime.JS_2_0,
        });

        const alias = handler.addAlias('live');
        const url = alias.addFunctionUrl({
            authType: FunctionUrlAuthType.NONE,
        });

        const bucket = new Bucket(this, 'Bucket');

        const distro = new Distribution(this, 'distro', {
            defaultBehavior: {
                origin: new FunctionUrlOrigin(url),
                functionAssociations: [
                    {
                        function: cfFunction,
                        eventType: FunctionEventType.VIEWER_REQUEST,
                    },
                ],
            },
        });
        distro.addBehavior('/images/*', new S3Origin(bucket));

        new KeyValueStore(this, 'KVStore');

        this.cloudFrontUrl = this.asOutput(distro.distributionDomainName);

        this.synth();
    }
}

const stack = new CloudFrontAppStack('cloudfront-app');
export const url = pulumi.interpolate`https://${stack.cloudFrontUrl}`;
