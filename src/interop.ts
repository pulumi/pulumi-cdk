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
import { toSdkName, typeToken } from './naming';
import * as path from 'path';
import * as fs from 'fs';

const glob = global as any;

export function firstToLower(str: string) {
    return str.replace(/\w\S*/g, function (txt) {
        return txt.charAt(0).toLowerCase() + txt.substring(1);
    });
}

class UnknownCfnType extends Error {
    constructor() {
        super("CfnType doesn't exist as a native type");
    }
}

export class Metadata {
    public static instance(provider: PulumiProvider): Metadata {
        if (glob.__pulumiMetadata == undefined) {
            glob.__pulumiMetadata = new Metadata(provider);
        }
        return glob.__pulumiMetadata;
    }
    private readonly pulumiMetadata: PulumiMetadata;
    constructor(provider: PulumiProvider) {
        if (provider === PulumiProvider.AWS_NATIVE) {
            this.pulumiMetadata = this.readMetadata();
        } else {
            throw new Error('AWS_NATIVE is the only supported pulumi provider');
        }
    }

    /**
     * Finds a specific resource in the metadata. Throws an UnknownCfnType error
     * if one is not found (probably means it is a classic type).
     *
     * @param cfnType The CloudFormation type i.e. AWS::S3::Bucket
     * @param metadata The PulumiMetadata to search
     * @returns The PulumiResource
     * @throws UnknownCfnType if the resource is not found
     */
    public findResource(cfnType: string): PulumiResource {
        const pType = typeToken(cfnType);
        if (pType in this.pulumiMetadata.resources) {
            return this.pulumiMetadata.resources[pType];
        }
        throw new UnknownCfnType();
    }

    public types(): { [key: string]: PulumiType } {
        return this.pulumiMetadata.types;
    }

    /**
     * Read the aws-native metadata.json file
     *
     * @returns the PulumiMetadata
     */
    private readMetadata(): PulumiMetadata {
        const contents = fs.readFileSync(path.join(__dirname, '../schemas/aws-native-metadata.json'), {
            encoding: 'utf-8',
        });
        const metadata: PulumiMetadata = JSON.parse(contents);
        return metadata;
    }
}

/**
 * If a property is a JSON type then we need provide
 * the value as is, without further processing.
 */
enum NativeType {
    /**
     * The type is a json type and should be left as is
     */
    JSON = 'JSON',
    /**
     * The type is not a json type and should be processed
     */
    NON_JSON = 'NON_JSON',
}

/**
 * Pulumi metadata.json schema. The real schema is a lot more detailed,
 * but we only need pieces of the schema for our purposes
 */
export interface PulumiMetadata {
    /**
     * The Pulumi resource schemas
     */
    resources: { [key: string]: PulumiResource };

    /**
     * The Pulumi types
     */
    types: { [key: string]: PulumiType };
}

/**
 * The Pulumi types. The type schema has a lot more attributes,
 * but for our purposes we only need the properties
 */
interface PulumiType {
    /**
     * The properties of a type
     */
    properties: { [key: string]: PulumiProperty };
}

/**
 * The schema for the array items property
 */
interface PulumiPropertyItems {
    /**
     * A reference to another type
     */
    $ref?: string;

    /**
     * The simple type (i.e. string, number, etc)
     */
    type?: string;
}

/**
 * The schema for an individual property on a resource
 */
interface PulumiProperty extends PulumiPropertyItems {
    /**
     * If the property is an array then it will have an items property
     */
    items?: PulumiPropertyItems;
}

interface PulumiResource {
    inputs: { [key: string]: PulumiProperty };
}

/**
 * Process an individual metadata property.
 * Either return the concrete type or the referenced type
 * We always just fallback to NON_JSON which will cause `normalize` to just process
 * the property without any special logic
 *
 * @param lastProp whether the property is the final key being processed (for nested properties)
 * @param property The property to process
 * @param types The pulumi metadata types
 * @returns either the NativeType if found or the nested property type
 */
function processMetadataProperty(
    lastProp: boolean,
    property: PulumiProperty,
    types: { [key: string]: PulumiType },
): {
    nativeType?: NativeType;
    meta?: { [key: string]: PulumiProperty };
} {
    switch (true) {
        case property.type !== undefined && property.$ref === undefined:
            if (property.type === 'object') {
                return { nativeType: NativeType.JSON };
            }
            if (property.type === 'array') {
                return processMetadataProperty(lastProp, property.items!, types);
            }
            return { nativeType: NativeType.NON_JSON };
        case property.$ref === 'pulumi.json#/Any':
            return { nativeType: NativeType.JSON };
        case property.$ref?.startsWith('pulumi.'):
            return { nativeType: NativeType.NON_JSON };
        case lastProp:
            return { nativeType: NativeType.NON_JSON };
        case property.$ref?.startsWith('#/types/aws-native:'): {
            const ref = property.$ref!.slice(8);
            if (ref && ref in types) {
                return { meta: types[ref].properties };
            }
        }
    }
    return { nativeType: NativeType.NON_JSON };
}

/**
 * Determines whether or not the property in question is a JSON type of not.
 * If the property is a nested property then the `propName` will contain all the parent
 * properties so that the correct nested type can be found
 *
 * @param properties The resource properties
 * @param propName the property name as a list containing parent property names
 * @param types The pulumi types
 * @returns true if the property is a JSON type and should not be normalized
 */
function isJsonType(
    propName: string[],
    properties: { [key: string]: PulumiProperty },
    types: { [key: string]: PulumiType },
): boolean {
    let props = properties;
    for (let i = 0; i < propName.length; i++) {
        const prop = toSdkName(propName[i]);
        if (prop in props) {
            const metaProp = props[prop];
            const { nativeType, meta } = processMetadataProperty(i + 1 === propName.length, metaProp, types);
            if (nativeType === NativeType.JSON) {
                return true;
            }
            props = meta!;
        }
    }
    return false;
}

/**
 * The pulumi provider to read the schema from
 */
export enum PulumiProvider {
    // We currently only support aws-native provider resources
    AWS_NATIVE = 'AWS_NATIVE',
}

/**
 * Recursively normalizes object types, with special handling for JSON types (which should not be normalized)
 *
 * @param key the property key as a list (including parent property names for nested properties)
 * @param value the value to normalize
 * @param cfnType The CloudFormation resource type being normalized (e.g. AWS::S3::Bucket). If no value
 * is provided then property conversion will be done without schema knowledge
 * @param pulumiProvider The pulumi provider to read the schema from. If `cfnType` is provided then this defaults
 * to PulumiProvider.AWS_NATIVE
 * @returns the normalized property value
 */
function normalizeObject(key: string[], value: any, cfnType?: string, pulumiProvider?: PulumiProvider): any {
    if (!value) return value;
    if (Array.isArray(value)) {
        const result: any[] = [];
        for (let i = 0; i < value.length; i++) {
            result[i] = normalizeObject(key, value[i], cfnType);
        }
        return result;
    }

    if (typeof value !== 'object' || pulumi.Output.isInstance(value) || value instanceof Promise) {
        return value;
    }

    const result: any = {};
    if (cfnType) {
        try {
            const metadata = Metadata.instance(pulumiProvider ?? PulumiProvider.AWS_NATIVE);
            const resource = metadata.findResource(cfnType);
            if (isJsonType(key, resource.inputs, metadata.types())) {
                return value;
            }

            Object.entries(value).forEach(([k, v]) => {
                result[toSdkName(k)] = normalizeObject([...key, k], v, cfnType);
            });
            return result;
        } catch (e) {
            debug(`error reading pulumi schema: ${e}`);
            // fallback to processing without the schema
            return normalizeGenericResourceObject(key, value);
        }
    }
    return normalizeGenericResourceObject(key, value);
}

function normalizeGenericResourceObject(key: string[], value: any): any {
    const result: any = {};
    Object.entries(value).forEach(([k, v]) => {
        result[toSdkName(k)] = normalizeObject([...key, k], v);
    });
    return result;
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
    constructor(name: string | undefined, construct: IConstruct, options?: pulumi.ComponentResourceOptions) {
        const constructType = construct.constructor.name || 'Construct';
        const constructName = name || construct.node.path;

        super(`cdk:construct:${constructType}`, constructName, {}, options);
    }

    public done() {
        this.registerOutputs({});
    }
}
