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
    setMocks();
    test('Checking single resource registration', async () => {
        await testApp((scope: Construct) => {
            new s3.Bucket(scope, 'MyFirstBucket', { versioned: true });
        });
    });

    test('LoadBalancer dnsName attribute does not throw', async () => {
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
        const o = pulumi.output('the-bucket-name');
        await testApp((scope: Construct) => {
            new s3.Bucket(scope, 'MyFirstBucket', { bucketName: output.asString(o) });
        });
    });
});
