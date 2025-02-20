// Copyright 2016-2024, Pulumi Corporation.
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
import { normalizeObject } from './pulumi-metadata';
import { toSdkName } from './naming';
import { PulumiProvider } from './types';

/**
 * normalize will take the resource properties for a specific CloudFormation resource and
 * will covert those properties to be compatible with Pulumi properties.
 *
 * @param value - The resource properties to be normalized
 * @param cfnType The CloudFormation resource type being normalized (e.g. AWS::S3::Bucket). If no value
 * is provided then property conversion will be done without schema knowledge
 * @param pulumiProvider The pulumi provider to read the schema from. If `cfnType` is provided then this defaults
 * to PulumiProvider.AWS_NATIVE
 * @returns The normalized resource properties
 */
export function normalize(value: any, cfnType?: string, pulumiProvider?: PulumiProvider): any {
    if (!value) return value;

    if (value instanceof Promise) {
        return pulumi.output(value).apply((v) => normalize(v, cfnType, pulumiProvider));
    }

    if (pulumi.Output.isInstance(value)) {
        return value.apply((v) => normalize(v, cfnType, pulumiProvider));
    }

    if (Array.isArray(value)) {
        const result: any[] = [];
        for (let i = 0; i < value.length; i++) {
            result[i] = normalize(value[i], cfnType, pulumiProvider);
        }
        return result;
    }

    if (typeof value !== 'object') {
        return value;
    }

    // The remaining case is the object type, representing either Maps or Object types with known field types in Pulumi.
    const result: any = {};
    Object.entries(value).forEach(([k, v]) => {
        result[toSdkName(k)] = normalizeObject([k], v, cfnType, pulumiProvider);
    });
    return result;
}

/**
 * Use this type if you need to control the attributes that are available on the
 * mapped resource. For example if the CFN resource has an attribute called `resourceArn` and
 * the mapped resource only has an attribute called `arn` you can return the extra `resourceArn`
 * attribute
 *
 * @example
 * return {
 *   resource: mappedResource,
 *   attributes: {
 *     resourceArn: mappedResource.arn,
 *   }
 * }
 */
export type ResourceAttributeMapping = {
    resource: pulumi.Resource;
    attributes?: { [name: string]: pulumi.Input<any> };
};

/**
 * Use this type if a single CFN resource maps to multiple AWS resources
 */
export type ResourceAttributeMappingArray = (ResourceAttributeMapping & { logicalId: string })[];

export type ResourceMapping = ResourceAttributeMapping | pulumi.Resource | ResourceAttributeMappingArray;
