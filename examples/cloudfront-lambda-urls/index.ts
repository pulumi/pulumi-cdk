import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import {
    Distribution,
    Function,
    FunctionCode,
    FunctionEventType,
    FunctionRuntime,
    KeyValueStore,
} from 'aws-cdk-lib/aws-cloudfront';
import { FunctionUrlOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { RemovalPolicy } from 'aws-cdk-lib';

class CloudFrontAppStack extends pulumicdk.Stack {
    public cloudFrontUrl: pulumi.Output<string>;
    constructor(scope: pulumicdk.App, id: string) {
        super(scope, id);

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

        const bucket = new Bucket(this, 'Bucket', {
            removalPolicy: RemovalPolicy.DESTROY,
        });

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
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new CloudFrontAppStack(scope, 'cloudfront-app');
            return { url: stack.cloudFrontUrl };
        });
    }
}
const app = new MyApp();
const output = app.outputs['url'];
export const url = pulumi.interpolate`https://${output}`;
