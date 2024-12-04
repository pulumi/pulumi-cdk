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

import * as path from 'path';
import { toSdkName, typeToken } from './naming';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pulumiMetadata = require(path.join(__dirname, '../schemas/aws-native-metadata.json'));
import { PulumiProvider } from './types';
import { debug } from '@pulumi/pulumi/log';
import * as pulumi from '@pulumi/pulumi';

export class UnknownCfnType extends Error {
    constructor(cfnType: string) {
        super(`CfnType ${cfnType} doesn't exist as a native type`);
    }
}

export class Metadata {
    private readonly pulumiMetadata: PulumiMetadata;
    constructor(provider: PulumiProvider) {
        if (provider !== PulumiProvider.AWS_NATIVE) {
            throw new Error('AWS_NATIVE is the only supported pulumi provider');
        }
        this.pulumiMetadata = pulumiMetadata as PulumiMetadata;
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
        const r = this.tryFindResource(cfnType);
        if (r === undefined) {
            throw new UnknownCfnType(cfnType);
        }
        return r;
    }

    /**
     * Non-throwing version of `findResource`.
     */
    public tryFindResource(cfnType: string): PulumiResource | undefined {
        const pType = typeToken(cfnType);
        if (pType in this.pulumiMetadata.resources) {
            return this.pulumiMetadata.resources[pType];
        }
        return undefined;
    }

    public types(): { [key: string]: PulumiType } {
        return this.pulumiMetadata.types;
    }
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
export interface PulumiType {
    /**
     * The properties of a type
     */
    properties: { [key: string]: PulumiProperty };
}

/**
 * The schema for the array items property
 * A property will typically have either $ref, properties or additionalProperties
 */
export interface PulumiPropertyItems {
    /**
     * A reference to another type
     */
    $ref?: string;

    /**
     * The properties of an object type
     */
    properties?: { [key: string]: PulumiPropertyItems };

    /**
     * The simple type (i.e. string, number, etc)
     */
    type?: string;

    /**
     * A type with additional properties
     */
    additionalProperties?: PulumiPropertyItems;
}

/**
 * The schema for an individual property on a resource
 */
export interface PulumiProperty extends PulumiPropertyItems {
    /**
     * If the property is an array then it will have an items property
     */
    items?: PulumiPropertyItems;
}

/**
 * The schema for an individual resource.
 */
export interface PulumiResource {
    cfRef?: CfRefBehavior;
    inputs: { [key: string]: PulumiProperty };
    outputs: { [key: string]: PulumiProperty };
}

/**
 * Metadata predicting the behavior of CF Ref intrinsic for a given resource.
 *
 * @internal
 */
export interface CfRefBehavior {
    /**
     * If set, indicates that Ref will return the value of the given Resource property directly.
     *
     * The property name is a CF name such as "GroupId".
     */
    property?: string;

    /**
     * If set, indicates that Ref will return a string value obtained by joining several Resource properties with a
     * delimiter, typically "|".
     */
    properties?: string[];

    /**
     * Delimiter for `properties`, typically "|".
     */
    delimiter?: string;

    /**
     * If set, Ref is not supported for this resource in CF.
     */
    notSupported?: boolean;

    /**
     * If set, Ref is supported in CF but this metadata is not yet available in the Pulumi aws-native provider but might
     * be added in a later version.
     */
    notSupportedYet?: boolean;
}

/**
 * If a property is a JSON type then we need provide
 * the value as is, without further processing.
 */
export enum NativeType {
    /**
     * The type is a json type and should be left as is
     */
    JSON = 'JSON',
    /**
     * The type is not a json type and should be processed
     */
    NON_JSON = 'NON_JSON',

    /**
     * The type an additional properties type which means the keys
     * should not be processed but the values should be
     */
    ADDITIONAL_PROPERTIES = 'ADDITIONAL_PROPERTIES',
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
 * @param pulumiProvider The pulumi provider to read the schema from.
 * @returns either the NativeType if found or the nested property type
 */
export function processMetadataProperty(
    property: PulumiProperty,
    types: { [key: string]: PulumiType },
    pulumiProvider: PulumiProvider,
): {
    nativeType?: NativeType;
    meta?: { [key: string]: PulumiProperty };
} {
    switch (true) {
        // Objects with `additionalProperties` can have arbitrary keys that should not be transformed
        // for example
        //
        // Case 1: additionalProperties that is a JSON type should return `NativeType.JSON` and treat the
        // entire object as a JSON object
        //   {
        //     "targetResources": {
        //       "additionalProperties": {
        //         "$ref": "pulumi.json#/Any"
        //       }
        //     }
        //   }
        //
        // Case 2: additionalProperties that is a non-JSON type should return `NativeType.ADDITIONAL_PROPERTIES`
        // so that the keys are not transformed but the values are
        //   {
        //     "throttle": {
        //       "additionalProperties": {
        //         "$ref": "#/types/pulumi:aws-native/aws:apigateway/UsagePlanThrottleSettings"
        //       }
        //     }
        //   }
        //   {
        //     "aws-native:aws:apigateway/UsagePlanThrottleSettings": {
        //       "type": "object",
        //       "properties": {
        //         "burstLimit": {
        //           "type": "integer"
        //         }
        //       }
        //     }
        //   }
        case property.type === 'object' && property.additionalProperties !== undefined: {
            const props = processMetadataProperty(property.additionalProperties, types, pulumiProvider);
            return {
                meta: props.meta,
                nativeType: props.nativeType === NativeType.JSON ? props.nativeType : NativeType.ADDITIONAL_PROPERTIES,
            };
        }
        case property.type !== undefined &&
            property.$ref === undefined &&
            property.properties === undefined &&
            property.additionalProperties === undefined:
            if (property.type === 'object') {
                return { nativeType: NativeType.JSON };
            }
            if (property.type === 'array') {
                return processMetadataProperty(property.items!, types, pulumiProvider);
            }
            return { nativeType: NativeType.NON_JSON };
        case property.$ref === 'pulumi.json#/Any':
            return { nativeType: NativeType.JSON };
        case property.$ref?.startsWith('pulumi.'):
            return { nativeType: NativeType.NON_JSON };
        case property.$ref?.startsWith(`#/types/${pulumiProvider}:`): {
            // strips away '#/types/' from the start of the string
            const ref = property.$ref!.slice(8);
            if (ref && ref in types) {
                return { meta: types[ref].properties };
            }
        }
    }
    return { nativeType: NativeType.NON_JSON };
}

/**
 * Determines the type of the provided property.
 *
 * If the property is a nested property then the `propName` will contain all the parent
 * properties so that the correct nested type can be found
 *
 * @param properties The resource properties
 * @param propName the property name as a list containing parent property names
 * @param types The pulumi types
 * @param pulumiProvider The pulumi provider to read the schema from.
 * @returns the NativeType of the property
 */
export function getNativeType(
    propName: string[],
    properties: { [key: string]: PulumiProperty },
    types: { [key: string]: PulumiType },
    pulumiProvider: PulumiProvider,
): NativeType {
    let props = properties;
    let typ: NativeType = NativeType.NON_JSON;
    for (let i = 0; i < propName.length; i++) {
        const prop = toSdkName(propName[i]);
        if (prop in props) {
            const metaProp = props[prop];

            const { nativeType, meta } = processMetadataProperty(metaProp, types, pulumiProvider);
            if (nativeType === NativeType.JSON) {
                return nativeType;
            }
            typ = nativeType ?? NativeType.NON_JSON;
            props = meta!;
        } else {
            return NativeType.NON_JSON;
        }
    }
    return typ;
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
export function normalizeObject(key: string[], value: any, cfnType?: string, pulumiProvider?: PulumiProvider): any {
    if (!value) return value;

    if (value instanceof Promise) {
        return pulumi.output(value).apply((v) => normalizeObject(key, v, cfnType, pulumiProvider));
    }

    if (pulumi.Output.isInstance(value)) {
        return value.apply((v) => normalizeObject(key, v, cfnType, pulumiProvider));
    }

    if (Array.isArray(value)) {
        const result: any[] = [];
        for (let i = 0; i < value.length; i++) {
            result[i] = normalizeObject(key, value[i], cfnType);
        }
        return result;
    }

    if (typeof value !== 'object') {
        return value;
    }

    // The remaining case is the actual object type.
    const result: any = {};
    if (cfnType) {
        try {
            pulumiProvider = pulumiProvider ?? PulumiProvider.AWS_NATIVE;
            const metadata = new Metadata(pulumiProvider);
            const resource = metadata.findResource(cfnType);
            const nativeType = getNativeType(key, resource.inputs, metadata.types(), pulumiProvider);
            if (nativeType === NativeType.JSON) {
                return value;
            }

            Object.entries(value).forEach(([k, v]) => {
                k = nativeType === NativeType.ADDITIONAL_PROPERTIES ? k : toSdkName(k);
                result[k] = normalizeObject([...key, k], v, cfnType);
            });
            return result;
        } catch (e) {
            debug(`[CDK Adapter] error reading pulumi schema: ${e}`);
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
