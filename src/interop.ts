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

import * as cdk from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
import { debug } from '@pulumi/pulumi/log';
import { IConstruct } from 'constructs';

export function urnEncode(str: string): string {
    return str.replace(/:/g, '%3A');
}

export function firstToLower(str: string) {
    return str.replace(/\w\S*/g, function (txt) {
        return txt.charAt(0).toLowerCase() + txt.substr(1);
    });
}

function moduleName(resourceType: string): string {
    const resourceTypeComponents = resourceType.split('::');
    let module = resourceTypeComponents[1];

    // Override the name of the Config module.
    if (module == 'Config') {
        module = 'Configuration';
    }

    return module.toLowerCase();
}

export function normalize(value: any): any {
    if (!value) return value;

    if (Array.isArray(value)) {
        const result: any[] = [];
        for (let i = 0; i < value.length; i++) {
            result[i] = normalize(value[i]);
        }
        return result;
    }

    if (typeof value !== 'object' || pulumi.Output.isInstance(value) || value instanceof Promise) {
        return value;
    }

    const result: any = {};
    Object.entries(value).forEach(([k, v]) => {
        result[firstToLower(k)] = normalize(v);
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
        const res = type.split('::')[2];
        const mod = moduleName(type);
        const resourceName = `aws-native:${mod}:${res}`;

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
    constructor(name: string | undefined, construct: IConstruct, options?: pulumi.ComponentResourceOptions) {
        const constructType = urnEncode(construct.constructor.name || 'Construct');
        const constructName = urnEncode(name || construct.node.path);

        super(`cdk:construct:${constructType}`, constructName, {}, options);
    }

    public done() {
        this.registerOutputs({});
    }
}

export class CdkComponent extends pulumi.ComponentResource {
    constructor(name: string, args: (stack: cdk.Stack) => void, opts?: pulumi.CustomResourceOptions) {
        super('cdk:index:Component', name, args, opts);

        const app = new cdk.App();
        const stack = new cdk.Stack(app);
        args(stack);

        //debugger;
        const template = app.synth().getStackByName(stack.stackName).template;
        console.debug(`template: ${JSON.stringify(template)}`);
        const resources = template.Resources;

        Object.entries(resources).forEach(([key, value]) => {
            const typeName = (value as any).Type;
            const sourceProps = (value as any).Properties;
            console.debug(`resource[${key}] Type:${typeName} props: ${sourceProps}`);
            opts = opts || { parent: this };
            new CfnResource(key, typeName, normalize(sourceProps), [], opts);
        });
    }
}
