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

import * as pulumi from "@pulumi/pulumi";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Stack } from "../src/interop-aspect";
import { Construct } from "constructs";
import { expect } from "chai";
import * as mocks from "./mocks";
import * as output from "../src/output";

mocks.setMocks();

function testStack(fn: (scope: Construct) => void, done: any) {
    class TestStack extends cdk.Stack {
        constructor(scope: Construct, id: string) {
            super(scope, id);

            fn(this);
        }
    }

    const s = new Stack('teststack', TestStack);
    s.urn.apply(() => done());
}

describe('Basic tests', () => {
    it('Checking single resource registration', done => {
        testStack(adapter => {
            new s3.Bucket(adapter, 'MyFirstBucket', { versioned: true });
        }, done)
    });

    it('Supports Output<T>', done => {
        const o = pulumi.output("the-bucket-name");
        testStack(adapter => {
            new s3.Bucket(adapter, 'MyFirstBucket', { bucketName: output.asString(o) });
        }, done);
    });
});
