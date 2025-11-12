import {
    ConcatValue,
    DynamicReferenceValue,
    ParameterReference,
    PropertyMap,
    PropertyValue,
    ResourceAttributeReference,
    SecretsManagerDynamicReferenceValue,
    StackAddress,
    StackOutputReference,
    SsmDynamicReferenceValue,
} from '@pulumi/cdk-convert-core';

export interface PropertySerializationContext {
    getResourceName(address: StackAddress): string | undefined;
    getStackOutputName(stackPath: string, outputName: string): string | undefined;
    getParameterDefault(stackPath: string, parameterName: string): PropertyValue | undefined;
}

export function serializePropertyValue(value: PropertyValue, ctx: PropertySerializationContext): any {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => serializePropertyValue(item, ctx));
    }

    if (isPropertyMap(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [key, serializePropertyValue(nested, ctx)]),
        );
    }

    switch (value.kind) {
        case 'resourceAttribute':
            return serializeResourceAttributeReference(value, ctx);
        case 'stackOutput':
            return serializeStackOutputReference(value, ctx);
        case 'parameter':
            return serializeParameterReference(value, ctx);
        case 'concat':
            return serializeConcatValue(value, ctx);
        case 'ssmDynamicReference':
            return serializeSsmDynamicReference(value);
        case 'secretsManagerDynamicReference':
            return serializeSecretsManagerDynamicReference(value);
        default:
            throw new Error(`Unsupported property value kind ${(value as any).kind}`);
    }
}

function isPropertyMap(value: PropertyValue): value is PropertyMap {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !('kind' in value);
}

function serializeResourceAttributeReference(
    value: ResourceAttributeReference,
    ctx: PropertySerializationContext,
): string {
    const resourceName = ctx.getResourceName(value.resource);
    if (!resourceName) {
        throw new Error(
            `Failed to resolve resource reference ${value.resource.id} in stack ${value.resource.stackPath}`,
        );
    }
    const propertyPart = value.propertyName ?? value.attributeName;
    return propertyPart ? `\${${resourceName}.${propertyPart}}` : `\${${resourceName}}`;
}

function serializeStackOutputReference(value: StackOutputReference, ctx: PropertySerializationContext): string {
    const outputName = ctx.getStackOutputName(value.stackPath, value.outputName);
    if (!outputName) {
        throw new Error(`Failed to resolve stack output ${value.outputName} in stack ${value.stackPath}`);
    }
    return `\${${outputName}}`;
}

function serializeParameterReference(value: ParameterReference, ctx: PropertySerializationContext): any {
    const defaultValue = ctx.getParameterDefault(value.stackPath, value.parameterName);
    if (defaultValue === undefined) {
        throw new Error(
            `Cannot serialize reference to parameter ${value.parameterName} in stack ${value.stackPath} because it does not have a default value`,
        );
    }
    return serializePropertyValue(defaultValue, ctx);
}

function serializeConcatValue(value: ConcatValue, ctx: PropertySerializationContext) {
    return {
        'fn::join': [
            value.delimiter,
            value.values.map((item) => serializePropertyValue(item, ctx)),
        ],
    };
}

function serializeSsmDynamicReference(value: SsmDynamicReferenceValue) {
    const invokeExpression = {
        'fn::invoke': {
            function: 'aws:ssm:getParameter',
            arguments: {
                name: value.parameterName,
                withDecryption: value.secure,
            },
            return: 'value',
        },
    };

    if (value.secure) {
        return {
            'fn::secret': invokeExpression,
        };
    }

    return invokeExpression;
}

function serializeSecretsManagerDynamicReference(value: SecretsManagerDynamicReferenceValue) {
    if (value.jsonKey) {
        throw new Error(
            `Secrets Manager dynamic references using jsonKey (${value.jsonKey}) are not supported in YAML serialization`,
        );
    }

    const invokeExpression = {
        'fn::invoke': {
            function: 'aws:secretsmanager:getSecretVersion',
            arguments: {
                secretId: value.secretId,
                ...(value.versionStage ? { versionStage: value.versionStage } : {}),
                ...(value.versionId ? { versionId: value.versionId } : {}),
            },
            return: value.secretString === 'SecretBinary' ? 'secretBinary' : 'secretString',
        },
    };

    return {
        'fn::secret': invokeExpression,
    };
}
