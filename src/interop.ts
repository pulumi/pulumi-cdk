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
import { PulumiResourceType } from './graph';

/**
 * @internal
 */
export function firstToLower(str: string) {
    return str.replace(/\w\S*/g, function (txt) {
        return txt.charAt(0).toLowerCase() + txt.substring(1);
    });
}

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

/**
 * extract a list of pulumi resources from a ResourceMapping
 * @internal
 */
export function resourcesFromResourceMapping(mapping: ResourceMapping): pulumi.Resource[] {
    if (Array.isArray(mapping)) {
        return mapping.map((m) => m.resource);
    } else if (pulumi.Resource.isInstance(mapping)) {
        return [mapping];
    } else {
        return [mapping.resource];
    }
}

/**
 * @internal
 */
export class CdkConstruct extends pulumi.ComponentResource {
    constructor(public readonly name: PulumiResourceType, type?: string, options?: pulumi.ComponentResourceOptions) {
        const constructType = type ?? 'Construct';
        const constructName = name;

        super(`cdk:construct:${constructType}`, constructName, {}, options);
    }

    public done() {
        this.registerOutputs({});
    }
}

const NESTED_STACK_CONSTRUCT_SYMBOL = Symbol.for('@pulumi/cdk.NestedStackConstruct');

/**
 * The NestedStackConstruct is a special construct that is used to represent a nested stack
 * and namespace the resources within it. It achieves this by including the stack path in the
 * resource type.
 * @internal
 */
export class NestedStackConstruct extends pulumi.ComponentResource {
    /**
     * Return whether the given object is a NestedStackConstruct.
     *
     * We do attribute detection in order to reliably detect nested stack constructs.
     * @internal
     */
    public static isNestedStackConstruct(x: any): x is NestedStackConstruct {
        return x !== null && typeof x === 'object' && NESTED_STACK_CONSTRUCT_SYMBOL in x;
    }

    constructor(stackPath: string, options?: pulumi.ComponentResourceOptions) {
        super(`cdk:construct:nested-stack/${stackPath}`, stackPath, {}, options);
        Object.defineProperty(this, NESTED_STACK_CONSTRUCT_SYMBOL, { value: true });
    }
}
