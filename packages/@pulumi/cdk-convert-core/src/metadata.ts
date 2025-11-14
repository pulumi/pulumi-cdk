import * as path from 'path';
import { toSdkName, typeToken } from './naming';
import { PulumiProvider } from './providers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pulumiMetadata = require(path.join(__dirname, '../schemas/aws-native-metadata.json'));

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

    public findResource(cfnType: string): PulumiResource {
        const r = this.tryFindResource(cfnType);
        if (r === undefined) {
            throw new UnknownCfnType(cfnType);
        }
        return r;
    }

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

export interface PulumiMetadata {
    resources: { [key: string]: PulumiResource };
    types: { [key: string]: PulumiType };
}

export interface PulumiType {
    properties: { [key: string]: PulumiProperty };
}

export interface PulumiPropertyItems {
    $ref?: string;
    properties?: { [key: string]: PulumiPropertyItems };
    type?: string;
    additionalProperties?: PulumiPropertyItems;
}

export interface PulumiProperty extends PulumiPropertyItems {
    items?: PulumiPropertyItems;
}

export interface PulumiResource {
    cfRef?: CfRefBehavior;
    inputs: { [key: string]: PulumiProperty };
    outputs: { [key: string]: PulumiProperty };
}

export interface CfRefBehavior {
    property?: string;
    properties?: string[];
    delimiter?: string;
    notSupported?: boolean;
    notSupportedYet?: boolean;
}

export enum NativeType {
    JSON = 'JSON',
    NON_JSON = 'NON_JSON',
    ADDITIONAL_PROPERTIES = 'ADDITIONAL_PROPERTIES',
}

export function processMetadataProperty(
    property: PulumiProperty,
    types: { [key: string]: PulumiType },
    pulumiProvider: PulumiProvider,
): {
    nativeType?: NativeType;
    meta?: { [key: string]: PulumiProperty };
} {
    switch (true) {
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
            const ref = property.$ref!.slice(8);
            if (ref && ref in types) {
                return { meta: types[ref].properties };
            }
        }
    }
    return { nativeType: NativeType.NON_JSON };
}

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
