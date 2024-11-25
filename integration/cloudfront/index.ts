import * as pulumi from '@pulumi/pulumi';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as pulumicdk from '@pulumi/cdk';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

const config = new pulumi.Config();
const prefix = config.require('prefix');

class CloudFrontStack extends pulumicdk.Stack {
    public readonly bucketName: pulumi.Output<string>;
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        const bucket = new s3.Bucket(this, 'Bucket', {
            removalPolicy: RemovalPolicy.DESTROY,
        });
        this.bucketName = this.asOutput(bucket.bucketName);
        const cachePolicy = new cloudfront.CachePolicy(this, 'CachePolicy', {
            maxTtl: Duration.days(1),
            minTtl: Duration.minutes(1),
            defaultTtl: Duration.hours(1),
            comment: 'A cache policy for the bucket',
            cookieBehavior: cloudfront.CacheCookieBehavior.all(),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList('X-Custom-Header'),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.denyList('username', 'password'),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
        });
        const originRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'OriginRequestPolicy', {
            queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
            headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList('X-Custom-Header'),
            comment: 'An origin request policy for the bucket',
            cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
        });

        const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
            responseHeadersPolicyName: 'MyPolicy',
            comment: 'A default policy',
            corsBehavior: {
                accessControlAllowCredentials: false,
                accessControlAllowHeaders: ['X-Custom-Header-1', 'X-Custom-Header-2'],
                accessControlAllowMethods: ['GET', 'POST'],
                accessControlAllowOrigins: ['*'],
                accessControlExposeHeaders: ['X-Custom-Header-1', 'X-Custom-Header-2'],
                accessControlMaxAge: Duration.seconds(600),
                originOverride: true,
            },
            customHeadersBehavior: {
                customHeaders: [
                    { header: 'X-Amz-Date', value: 'some-value', override: true },
                    { header: 'X-Amz-Security-Token', value: 'some-value', override: false },
                ],
            },
            securityHeadersBehavior: {
                contentSecurityPolicy: { contentSecurityPolicy: 'default-src https:;', override: true },
                contentTypeOptions: { override: true },
                frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
                referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
                strictTransportSecurity: {
                    accessControlMaxAge: Duration.seconds(600),
                    includeSubdomains: true,
                    override: true,
                },
                xssProtection: {
                    protection: true,
                    modeBlock: false,
                    reportUri: 'https://example.com/csp-report',
                    override: true,
                },
            },
            removeHeaders: ['Server'],
            serverTimingSamplingRate: 50,
        });
        const keyGroup = new cloudfront.KeyGroup(this, 'AwesomeKeyGroup', {
            items: [
                new cloudfront.PublicKey(this, 'AwesomePublicKey', {
                    encodedKey: `-----BEGIN PUBLIC KEY-----
                    MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAudf8/iNkQgdvjEdm6xYS
                    JAyxd/kGTbJfQNg9YhInb7TSm0dGu0yx8yZ3fnpmxuRPqJIlaVr+fT4YRl71gEYa
                    dlhHmnVegyPNjP9dNqZ7zwNqMEPOPnS/NOHbJj1KYKpn1f8pPNycQ5MQCntKGnSj
                    6fc+nbcC0joDvGz80xuy1W4hLV9oC9c3GT26xfZb2jy9MVtA3cppNuTwqrFi3t6e
                    0iGpraxZlT5wewjZLpQkngqYr6s3aucPAZVsGTEYPo4nD5mswmtZOm+tgcOrivtD
                    /3sD/qZLQ6c5siqyS8aTraD6y+VXugujfarTU65IeZ6QAUbLMsWuZOIi5Jn8zAwx
                    NQIDAQAB
                    -----END PUBLIC KEY-----
                    `,
                }),
            ],
        });

        const stream = new kinesis.Stream(this, 'stream', {
            encryption: kinesis.StreamEncryption.UNENCRYPTED,
            removalPolicy: RemovalPolicy.DESTROY,
        });
        const realtimeLogConfig = new cloudfront.RealtimeLogConfig(this, 'realtimeLog', {
            endPoints: [cloudfront.Endpoint.fromKinesisStream(stream)],
            fields: ['timestamp', 'c-ip', 'time-to-first-byte', 'sc-status'],
            realtimeLogConfigName: 'my-delivery-stream',
            samplingRate: 100,
        });

        const distro = new cloudfront.Distribution(this, 'distro', {
            defaultBehavior: {
                origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
                cachePolicy,
                originRequestPolicy,
                responseHeadersPolicy,
                trustedKeyGroups: [keyGroup],
                realtimeLogConfig,
            },
        });
        distro.addBehavior('/s3website', new origins.S3StaticWebsiteOrigin(bucket));
        distro.addBehavior('/s3identity', origins.S3BucketOrigin.withOriginAccessIdentity(bucket));
        distro.addBehavior(
            'failover',
            new origins.OriginGroup({
                primaryOrigin: origins.S3BucketOrigin.withBucketDefaults(bucket),
                fallbackOrigin: new origins.HttpOrigin('example.com'),
            }),
        );
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new CloudFrontStack(scope, `${prefix}-cloudfront`);
    return {
        bucketName: stack.bucketName,
    };
});

export const bucketName = app.outputs['bucketName'];
