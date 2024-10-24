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
import { MockCallArgs, MockResourceArgs } from '@pulumi/pulumi/runtime';

function arn(service: string, type: string): string {
    const [region, account] = service === 's3' ? ['', ''] : ['us-west-2', '123456789012'];
    return `arn:aws:${service}:${region}:${account}:${type}`;
}

function setMocks() {
    pulumi.runtime.setMocks({
        call: (args: MockCallArgs) => {
            return {};
        },
        newResource: (args: MockResourceArgs): { id: string; state: any } => {
            switch (args.type) {
                case 'cdk:index:Stack':
                    return { id: '', state: {} };
                case 'cdk:construct:TestStack':
                    return { id: '', state: {} };
                case 'cdk:construct:teststack':
                    return { id: '', state: {} };
                case 'cdk:index:Component':
                    return { id: '', state: {} };
                case 'cdk:construct:aws-cdk-lib/aws_s3:Bucket':
                    return { id: '', state: {} };
                case 'aws-native:s3:Bucket':
                    return {
                        id: args.name,
                        state: {
                            ...args.inputs,
                            arn: arn('s3', args.inputs['bucketName']),
                        },
                    };
                default:
                    throw new Error(`unrecognized resource type ${args.type}`);
            }
        },
    });
}

function testStack(fn: (scope: Construct) => void, done: any) {
    class TestStack extends Stack {
        constructor(id: string) {
            super(id);

            fn(this);

            this.synth();
        }
    }

    const s = new TestStack('teststack');
    s.urn.apply(() => done());
}

describe('Basic tests', () => {
    beforeEach(() => {
        setMocks();
    });
    test('Checking single resource registration', (done) => {
        testStack((adapter) => {
            new s3.Bucket(adapter, 'MyFirstBucket', { versioned: true });
        }, done);
    });

    test('Supports Output<T>', (done) => {
        const o = pulumi.output('the-bucket-name');
        testStack((adapter) => {
            new s3.Bucket(adapter, 'MyFirstBucket', { bucketName: output.asString(o) });
        }, done);
    });
});
