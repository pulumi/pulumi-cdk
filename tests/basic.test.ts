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
import { Stack } from '../src/stack';
import { Construct } from 'constructs';
import * as output from '../src/output';
import { promiseOf, setMocks } from './mocks';
import { ApplicationLoadBalancer } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { aws_ssm } from 'aws-cdk-lib';

function testStack(id: string, fn: (scope: Construct) => void): Stack {
    class TestStack extends Stack {
        constructor(id: string) {
            super(id);

            fn(this);

            this.synth();
        }
    }

    const s = new TestStack(id);
    return s;
}

beforeAll(() => {
    setMocks();
});

describe('Basic tests', () => {
    test('Checking single resource registration', async () => {
        const stack = testStack('test1', (adapter) => {
            new s3.Bucket(adapter, 'MyFirstBucket', { versioned: true });
        });
        const urn = await promiseOf(stack.urn);
        expect(urn).toEqual('urn:pulumi:stack::project::cdk:index:Stack::test1');
    });

    test('Supports Output<T>', async () => {
        const o = pulumi.output('the-bucket-name');
        const stack = testStack('test2', (adapter) => {
            new s3.Bucket(adapter, 'MyFirstBucket', { bucketName: output.asString(o) });
        });
        const urn = await promiseOf(stack.urn);
        expect(urn).toEqual('urn:pulumi:stack::project::cdk:index:Stack::test2');
    });
    test('LoadBalancer dnsName attribute does not throw', async () => {
        const stack = testStack('test3', (scope) => {
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
        const urn = await promiseOf(stack.urn);
        expect(urn).toEqual('urn:pulumi:stack::project::cdk:index:Stack::test3');
    });
});
