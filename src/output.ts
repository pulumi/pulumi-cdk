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
import { Token } from 'aws-cdk-lib';
import { OutputMap } from './output-map';

/**
 * Convert a Pulumi Output to a CDK string value.
 *
 * @param o A Pulumi Output value which represents a string.
 * @returns A CDK token representing a string value.
 */
export function asString(o: pulumi.Output<string>): string {
    return Token.asString(OutputMap.instance().registerOutput(o));
}

/**
 * Convert a Pulumi Output to a CDK number value.
 *
 * @param o A Pulumi Output value which represents a number.
 * @returns A CDK token representing a number value.
 */
export function asNumber(o: pulumi.Output<number>): number {
    return Token.asNumber(OutputMap.instance().registerOutput(o));
}

/**
 * Convert a Pulumi Output to a list of CDK string values.
 *
 * @param o A Pulumi Output value which represents a list of strings.
 * @returns A CDK token representing a list of string values.
 */
export function asList(o: pulumi.Output<string[]>): string[] {
    return Token.asList(OutputMap.instance().registerOutput(o));
}
