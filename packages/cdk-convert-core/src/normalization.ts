import { toSdkName } from './naming';
import { Metadata, NativeType, getNativeType } from './metadata';
import { PulumiProvider } from './providers';

export interface NormalizeResourceOptions {
    cfnType?: string;
    pulumiProvider?: PulumiProvider;
    metadata?: Metadata;
    valueTransformer?: (value: any, keyPath: string[]) => any | undefined;
}

const metadataCache = new Map<PulumiProvider, Metadata>();

function getMetadata(provider: PulumiProvider): Metadata {
    let existing = metadataCache.get(provider);
    if (!existing) {
        existing = new Metadata(provider);
        metadataCache.set(provider, existing);
    }
    return existing;
}

export function normalizeResourceProperties(value: any, options?: NormalizeResourceOptions): any {
    if (value === null || value === undefined) {
        return value;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }

    const result: any = {};
    for (const [key, val] of Object.entries(value)) {
        result[toSdkName(key)] = normalizeValue([key], val, options);
    }
    return result;
}

export function normalizeValue(keyPath: string[], value: any, options?: NormalizeResourceOptions): any {
    if (value === null || value === undefined) {
        return value;
    }

    if (options?.valueTransformer) {
        const transformed = options.valueTransformer(value, keyPath);
        if (transformed !== undefined) {
            return transformed;
        }
    }

    if (isIntrinsicValueObject(value)) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => normalizeValue(keyPath, item, options));
    }

    if (typeof value !== 'object') {
        return value;
    }

    return normalizeObject(keyPath, value, options);
}

function normalizeObject(key: string[], value: Record<string, any>, options?: NormalizeResourceOptions): any {
    if (!options?.cfnType) {
        return normalizeGenericResourceObject(key, value, options);
    }

    try {
        const provider = options.pulumiProvider ?? PulumiProvider.AWS_NATIVE;
        const metadata = options.metadata ?? getMetadata(provider);
        const resource = metadata.findResource(options.cfnType);
        const nativeType = getNativeType(key, resource.inputs, metadata.types(), provider);
        if (nativeType === NativeType.JSON) {
            return value;
        }

        const result: any = {};
        for (const [rawKey, rawVal] of Object.entries(value)) {
            const nextKey = nativeType === NativeType.ADDITIONAL_PROPERTIES ? rawKey : toSdkName(rawKey);
            result[nextKey] = normalizeValue([...key, nextKey], rawVal, options);
        }
        return result;
    } catch {
        return normalizeGenericResourceObject(key, value, options);
    }
}

function normalizeGenericResourceObject(key: string[], value: Record<string, any>, options?: NormalizeResourceOptions) {
    const result: any = {};
    for (const [rawKey, rawVal] of Object.entries(value)) {
        result[toSdkName(rawKey)] = normalizeValue([...key, rawKey], rawVal, options);
    }
    return result;
}

function isIntrinsicValueObject(value: any): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    return typeof (value as { kind?: unknown }).kind === 'string';
}
