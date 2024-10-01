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
import { debug } from '@pulumi/pulumi/log';
import { IConstruct } from 'constructs';
import { normalizeObject } from './pulumi-metadata';
import { toSdkName, typeToken } from './naming';
import { PulumiProvider } from './types';
import { ConstructInfo } from './graph';

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

    if (Array.isArray(value)) {
        const result: any[] = [];
        for (let i = 0; i < value.length; i++) {
            result[i] = normalize(value[i], cfnType);
        }
        return result;
    }

    if (typeof value !== 'object' || pulumi.Output.isInstance(value) || value instanceof Promise) {
        return value;
    }

    const result: any = {};
    Object.entries(value).forEach(([k, v]) => {
        result[toSdkName(k)] = normalizeObject([k], v, cfnType, pulumiProvider);
    });
    return result;
}

export type ResourceMapping =
    | {
          resource: pulumi.Resource;
          attributes: { [name: string]: pulumi.Input<any> };
      }
    | pulumi.Resource;

export class CfnResource extends pulumi.CustomResource {
    constructor(
        name: string,
        type: string,
        properties: any,
        attributes: string[],
        opts?: pulumi.CustomResourceOptions,
    ) {
        const resourceName = typeToken(type);

        debug(`CfnResource ${resourceName}: ${JSON.stringify(properties)}, ${JSON.stringify(attributes)}`);

        // Prepare an args bag with placeholders for output attributes.
        const args: any = {};
        for (const k of attributes) {
            args[k] = undefined;
        }
        Object.assign(args, properties);

        // console.debug(`CfnResource opts: ${JSON.stringify(opts)}`)
        super(resourceName, name, args, opts);
    }
}

export const JSII_RUNTIME_SYMBOL = Symbol.for('jsii.rtti');

export function getFqn(construct: IConstruct): string | undefined {
    return Object.getPrototypeOf(construct).constructor[JSII_RUNTIME_SYMBOL]?.fqn;
}

export class CdkConstruct extends pulumi.ComponentResource {
    constructor(name: string, type?: string, options?: pulumi.ComponentResourceOptions) {
        const constructType = type ?? 'Construct';
        const constructName = name;

        super(`cdk:construct:${constructType}`, constructName, {}, options);
    }

    public done() {
        this.registerOutputs({});
    }
}
