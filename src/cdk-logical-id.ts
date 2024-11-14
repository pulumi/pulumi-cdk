// Copyright 2018-2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
//
// NOTE:
// Most of this code was copied from https://github.com/aws/aws-cdk/blob/ccab485b87a7090ddf0773508d7b8ee84ff654b0/packages/aws-cdk-lib/core/lib/private/uniqueid.ts
// with the modification of removing logic related to adding the path hash to the logicalId
import * as cdk from 'aws-cdk-lib/core';
/**
 * Resources with this ID are hidden from humans
 *
 * They do not appear in the human-readable part of the logical ID
 */
const HIDDEN_FROM_HUMAN_ID = 'Resource';

/**
 * Resources with this ID are complete hidden from the logical ID calculation.
 */
const HIDDEN_ID = 'Default';
const MAX_HUMAN_LEN = 240; // this is the value in CDK and seems like a good default to keep

/**
 * Calculates a unique ID for a set of textual components.
 *
 * This is forked from the internal cdk implementation with the removal of the hash suffix.
 * We remove the hash from the CDK logical ID calculation because Pulumi already handles
 * adding a unique random suffix and we do not want to end up with a double hash.
 * @see https://github.com/aws/aws-cdk/blob/ccab485b87a7090ddf0773508d7b8ee84ff654b0/packages/aws-cdk-lib/core/lib/private/uniqueid.ts?plain=1#L32
 *
 * @param components The path components
 * @returns a unique alpha-numeric identifier with a maximum length of 255
 */
export function makeUniqueId(components: string[]) {
    components = components.filter((x) => x !== HIDDEN_ID);

    if (components.length === 0) {
        throw new Error('Unable to calculate a unique id for an empty set of components');
    }

    // Lazy require in order to break a module dependency cycle
    const unresolvedTokens = components.filter((c) => cdk.Token.isUnresolved(c));
    if (unresolvedTokens.length > 0) {
        throw new Error(`ID components may not include unresolved tokens: ${unresolvedTokens.join(',')}`);
    }

    const human = removeDupes(components)
        .filter((x) => x !== HIDDEN_FROM_HUMAN_ID)
        .map(removeNonAlphanumeric)
        .join('')
        .slice(0, MAX_HUMAN_LEN);

    return human;
}

/**
 * Remove duplicate "terms" from the path list
 *
 * If the previous path component name ends with this component name, skip the
 * current component.
 */
function removeDupes(path: string[]): string[] {
    const ret = new Array<string>();

    for (const component of path) {
        if (ret.length === 0 || !ret[ret.length - 1].endsWith(component)) {
            ret.push(component);
        }
    }

    return ret;
}

/**
 * Removes all non-alphanumeric characters in a string.
 */
function removeNonAlphanumeric(s: string) {
    return s.replace(/[^A-Za-z0-9]/g, '');
}
