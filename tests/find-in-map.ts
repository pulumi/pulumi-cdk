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

import * as cdk from "aws-cdk-lib";
import { Stack } from "../src";
import { expect } from "chai";
import * as mocks from "./mocks";
import { Output } from "@pulumi/pulumi";

mocks.setMocks();

class TestStack extends Stack {
    readonly mapValue: Output<string>;
    constructor(id: string, fn: (scope: TestStack) => Output<string>) {
        super(id);
        this.mapValue = fn(this);
        this.synth();
    }
}

describe('Fn:FindInMap tests', () => {
    it('Correctly parses Fn::FindInMap without references', done => {
        const instanceType = "t3.micro";

        const s = new TestStack('teststack', (adapter) => {
            const regionMap = new cdk.CfnMapping(adapter, 'RegionMap', {
                mapping: {
                    "us-east-1": {
                        InstanceType: instanceType,
                    },
                },
            });
            return adapter.asOutput(regionMap.findInMap("us-east-1", "InstanceType"));
        });
        s.mapValue.apply((value) => {
            expect(value).to.equal(instanceType);
            done();
        });
    });

    it('Correctly parses Fn::FindInMap with references', done => {
        const cloudfrontHostedZoneId = "Z2FDTNDATAQYW2";

        const s = new TestStack('teststack', (adapter) => {
            const cloudfrontHostedZoneMap = new cdk.CfnMapping(adapter, 'AWSCloudFrontPartitionHostedZoneIdMap', {
                mapping: {
                    aws: {
                        zoneId: cloudfrontHostedZoneId,
                    },
                },
            });
            return adapter.asOutput(cloudfrontHostedZoneMap.findInMap(adapter.partition, "zoneId"));
        });
        s.mapValue.apply((value) => {
            expect(value).to.equal(cloudfrontHostedZoneId);
            done();
        });
    });
});
