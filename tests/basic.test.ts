// Copyright 2016-2022, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as native from '@pulumi/aws-native';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as output from '../src/output';
import { setMocks, testApp } from './mocks';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { aws_ssm } from 'aws-cdk-lib';
import { Construct } from 'constructs';

beforeAll(() => {
    process.env.AWS_REGION = 'us-east-2';
});
afterAll(() => {
    process.env.AWS_REGION = undefined;
});

describe('Basic tests', () => {
    test('Checking single resource registration', async () => {
        setMocks();
        await testApp((scope: Construct) => {
            new s3.Bucket(scope, 'MyFirstBucket', { versioned: true });
        });
    });

    test('LoadBalancer dnsName attribute does not throw', async () => {
        setMocks();
        await testApp((scope: Construct) => {
            const vpc = new Vpc(scope, 'vpc');
            const alb = new ApplicationLoadBalancer(scope, 'alb', {
                vpc,
            });

            new aws_ssm.StringParameter(scope, 'param', {
                // Referencing the `dnsName` attribute of the LoadBalancer resource.
                // This tests that the reference is correctly mapped, otherwise this test
                // throws an error
                stringValue: alb.loadBalancerDnsName,
            });
        });
    });
    test('Supports Output<T>', async () => {
        setMocks();
        const o = pulumi.output('the-bucket-name');
        await testApp((scope: Construct) => {
            new s3.Bucket(scope, 'MyFirstBucket', { bucketName: output.asString(o) });
        });
    });

    test('Creates native provider by default', async () => {
        const resources: pulumi.runtime.MockResourceArgs[] = [];
        setMocks(resources);
        await testApp((scope: Construct) => {
            new s3.Bucket(scope, 'MyFirstBucket', { versioned: true });
        });
        const providers = resources.filter((r) => r.type === 'pulumi:providers:aws-native');
        expect(providers).toHaveLength(1);
        expect(providers[0]).toEqual(
            expect.objectContaining({
                inputs: {
                    autoNaming: '{"randomSuffixMinLength":7,"autoTrim":true}',
                    region: 'us-east-2',
                    skipCredentialsValidation: 'true',
                    skipGetEc2Platforms: 'true',
                    skipMetadataApiCheck: 'true',
                    skipRegionValidation: 'true',
                },
                name: 'cdk-aws-native',
                provider: '',
                type: 'pulumi:providers:aws-native',
            }),
        );
    });

    test('Creates native provider when classic provided', async () => {
        const resources: pulumi.runtime.MockResourceArgs[] = [];
        setMocks(resources);
        await testApp(
            (scope: Construct) => {
                new s3.Bucket(scope, 'MyFirstBucket', { versioned: true });
            },
            {
                providers: [new aws.Provider('test-aws', {})],
            },
        );
        const providers = resources.filter((r) => r.type === 'pulumi:providers:aws-native');
        expect(providers).toHaveLength(1);
        expect(providers[0]).toEqual(
            expect.objectContaining({
                inputs: {
                    autoNaming: '{"randomSuffixMinLength":7,"autoTrim":true}',
                    region: 'us-east-2',
                    skipCredentialsValidation: 'true',
                    skipGetEc2Platforms: 'true',
                    skipMetadataApiCheck: 'true',
                    skipRegionValidation: 'true',
                },
                name: 'cdk-aws-native',
                provider: '',
                type: 'pulumi:providers:aws-native',
            }),
        );
    });

    test('Creates native provider when classic provided object', async () => {
        const resources: pulumi.runtime.MockResourceArgs[] = [];
        setMocks(resources);
        await testApp(
            (scope: Construct) => {
                new s3.Bucket(scope, 'MyFirstBucket', { versioned: true });
            },
            {
                providers: {
                    aws: new aws.Provider('test-aws', {}),
                },
            },
        );
        const providers = resources.filter((r) => r.type === 'pulumi:providers:aws-native');
        expect(providers).toHaveLength(1);
        expect(providers[0]).toEqual(
            expect.objectContaining({
                inputs: {
                    autoNaming: '{"randomSuffixMinLength":7,"autoTrim":true}',
                    region: 'us-east-2',
                    skipCredentialsValidation: 'true',
                    skipGetEc2Platforms: 'true',
                    skipMetadataApiCheck: 'true',
                    skipRegionValidation: 'true',
                },
                name: 'cdk-aws-native',
                provider: '',
                type: 'pulumi:providers:aws-native',
            }),
        );
    });

    test('does not create native provider when one is provided', async () => {
        const resources: pulumi.runtime.MockResourceArgs[] = [];
        setMocks(resources);
        await testApp(
            (scope: Construct) => {
                new s3.Bucket(scope, 'MyFirstBucket', { versioned: true });
            },
            {
                providers: [
                    new native.Provider('test-native', {
                        region: 'us-west-2',
                    }),
                ],
            },
        );
        const providers = resources.filter((r) => r.type === 'pulumi:providers:aws-native');
        expect(providers).toHaveLength(1);
        expect(providers[0]).toEqual(
            expect.objectContaining({
                inputs: {
                    region: 'us-west-2',
                    skipCredentialsValidation: 'true',
                    skipGetEc2Platforms: 'true',
                    skipMetadataApiCheck: 'true',
                    skipRegionValidation: 'true',
                },
                name: 'test-native',
                provider: '',
                type: 'pulumi:providers:aws-native',
            }),
        );
    });

    test('does not create native provider when one is provided object', async () => {
        const resources: pulumi.runtime.MockResourceArgs[] = [];
        setMocks(resources);
        await testApp(
            (scope: Construct) => {
                new s3.Bucket(scope, 'MyFirstBucket', { versioned: true });
            },
            {
                providers: {
                    'aws-native': new native.Provider('test-native', {
                        region: 'us-west-2',
                    }),
                },
            },
        );
        const providers = resources.filter((r) => r.type === 'pulumi:providers:aws-native');
        expect(providers).toHaveLength(1);
        expect(providers[0]).toEqual(
            expect.objectContaining({
                inputs: {
                    region: 'us-west-2',
                    skipCredentialsValidation: 'true',
                    skipGetEc2Platforms: 'true',
                    skipMetadataApiCheck: 'true',
                    skipRegionValidation: 'true',
                },
                name: 'test-native',
                provider: '',
                type: 'pulumi:providers:aws-native',
            }),
        );
    });
});
