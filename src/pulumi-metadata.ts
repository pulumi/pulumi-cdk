import * as path from 'path';
import * as pulumi from '@pulumi/pulumi';
import { toSdkName, typeToken } from './naming';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pulumiMetadata = require(path.join(__dirname, '../schemas/aws-native-metadata.json'));
import { PulumiProvider } from './types';
import { debug } from '@pulumi/pulumi/log';

export class UnknownCfnType extends Error {
    constructor() {
        super("CfnType doesn't exist as a native type");
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
        const pType = typeToken(cfnType);
        if (pType in this.pulumiMetadata.resources) {
            return this.pulumiMetadata.resources[pType];
        }
        throw new UnknownCfnType();
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
 */
export interface PulumiPropertyItems {
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
export interface PulumiProperty extends PulumiPropertyItems {
    /**
     * If the property is an array then it will have an items property
     */
    items?: PulumiPropertyItems;
}

export interface PulumiResource {
    inputs: { [key: string]: PulumiProperty };
    outputs: { [key: string]: PulumiProperty };
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
        case property.type !== undefined && property.$ref === undefined:
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
 * Determines whether or not the property in question is a JSON type of not.
 * If the property is a nested property then the `propName` will contain all the parent
 * properties so that the correct nested type can be found
 *
 * @param properties The resource properties
 * @param propName the property name as a list containing parent property names
 * @param types The pulumi types
 * @param pulumiProvider The pulumi provider to read the schema from.
 * @returns true if the property is a JSON type and should not be normalized
 */
export function isJsonType(
    propName: string[],
    properties: { [key: string]: PulumiProperty },
    types: { [key: string]: PulumiType },
    pulumiProvider: PulumiProvider,
): boolean {
    let props = properties;
    for (let i = 0; i < propName.length; i++) {
        const prop = toSdkName(propName[i]);
        if (prop in props) {
            const metaProp = props[prop];
            const { nativeType, meta } = processMetadataProperty(metaProp, types, pulumiProvider);
            if (nativeType === NativeType.JSON) {
                return true;
            }
            props = meta!;
        }
    }
    return false;
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
            pulumiProvider = pulumiProvider ?? PulumiProvider.AWS_NATIVE;
            const metadata = new Metadata(pulumiProvider);
            const resource = metadata.findResource(cfnType);
            if (isJsonType(key, resource.inputs, metadata.types(), pulumiProvider)) {
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
