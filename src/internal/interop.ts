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
import { PulumiResourceType } from '@pulumi/cdk-convert-core/graph';
import { ResourceMapping } from '../interop';

export function firstToLower(str: string) {
    return str.replace(/\w\S*/g, function (txt) {
        return txt.charAt(0).toLowerCase() + txt.substring(1);
    });
}

/**
 * extract a list of pulumi resources from a ResourceMapping
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
 * @hidden
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
