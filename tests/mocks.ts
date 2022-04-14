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
import { MockCallArgs, MockResourceArgs } from "@pulumi/pulumi/runtime";

export function setMocks() {
    pulumi.runtime.setMocks({
        call: (args: MockCallArgs) => {
            return {};
        },
        newResource: (args: MockResourceArgs): {id: string; state: any} => {
            switch (args.type) {
                case "cdk:index:StackComponent":
                    return { id: "", state: {} };
                case "cdk:index:Component":
                    return { id: "", state: {} };
                case "aws-native:s3:Bucket":
                    return {
                        id: args.name,
                        state: {
                            ...args.inputs,
                            arn: `arn:aws:s3:::${args.inputs["bucketName"]}`,
                        },
                    };
                default:
                    throw new Error(`unrecognized resource type ${args.type}`);
            }
        },
    });
}
