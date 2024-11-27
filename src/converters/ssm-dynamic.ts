import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { containsEventuals } from '../types';

/**
 * The regular expression used to match an SSM plaintext dynamic reference.
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-ssm.html#dynamic-references-ssm-pattern
 */
const SSM_PLAINTEXT_DYNAMIC_REGEX = /{{resolve:ssm:([a-zA-Z0-9_.\-/]+(?::\d+)?)}}/;

/**
 * The regular expression used to match an SSM SecureString dynamic reference.
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-ssm-secure-strings.html#dynamic-references-ssm-secure-pattern
 */
const SSM_SECURE_DYNAMIC_REGEX = /{{resolve:ssm-secure:([a-zA-Z0-9_.\-/]+(?::\d+)?)}}/;

export interface SSMDynamicReference {
    /**
     * The name of the parameter you want to reference.
     * This will also include the version if specified.
     */
    parameterName: string;
}

/**
 * Parses an SSM plaintext dynamic reference and returns the parameter name.
 *
 * @param value - The value which contains the SSM plaintext dynamic reference
 * @returns The parameter name
 */
export function parseSSMDynamicSecureStringReference(value: string): SSMDynamicReference {
    const match = value.match(SSM_SECURE_DYNAMIC_REGEX);
    if (!match) {
        throw new Error(`Failed to parse SSM SecureString dynamic reference: ${value}`);
    }

    const [_, parameterName] = match;
    return {
        parameterName,
    };
}

/**
 * Parses an SSM SecureString dynamic reference and returns the parameter name.
 *
 * @param value - The value which contains the SSM SecureString dynamic reference
 * @returns The parameter name
 */
export function parseSSMDynamicPlaintextReference(value: string): SSMDynamicReference {
    const match = value.match(SSM_PLAINTEXT_DYNAMIC_REGEX);
    if (!match) {
        throw new Error(`Failed to parse SSM plaintext dynamic reference: ${value}`);
    }

    const [_, parameterName] = match;
    return {
        parameterName,
    };
}

/**
 * Resolves an SSM plaintext dynamic reference
 *
 * @param parent - The parent resource for the SSM parameter function
 * @param value - The value which contains the SSM plaintext dynamic reference
 * @returns The parameter value as a pulumi output
 */
export function resolveSSMDynamicPlaintextReference(
    parent: pulumi.Resource,
    value: string,
): pulumi.Output<string | string[]> {
    // This shouldn't happen because we currently only call this where we know we have a string
    // but adding this for completeness
    if (containsEventuals(value)) {
        throw new Error('SSM dynamic references cannot contain unresolved values');
    }

    const parts = parseSSMDynamicPlaintextReference(value);
    return aws.ssm
        .getParameterOutput(
            {
                name: parts.parameterName,
                // we don't want to return a decrypted SecureString value
                // SecureString types are handled elsewhere
                withDecryption: false,
            },
            { parent },
        )
        .apply((v) => {
            switch (v.type) {
                // CDK/CloudFormation will return a string for both String and StringList types
                case 'String':
                case 'StringList':
                    return v.value;
                default:
                    throw new Error(`Unsupported SSM parameter type: ${v.type}`);
            }
        });
}

/**
 * Resolves an SSM SecureString dynamic reference
 *
 * @param parent - The parent resource for the SSM parameter function
 * @param value - The value which contains the SSM SecureString dynamic reference
 * @returns The parameter value as a pulumi secret output
 */
export function resolveSSMDynamicSecureStringReference(parent: pulumi.Resource, value: string): pulumi.Output<string> {
    // This shouldn't happen because we currently only call this where we know we have a string
    // but adding this for completeness
    if (containsEventuals(value)) {
        throw new Error('SSM dynamic references cannot contain unresolved values');
    }

    const parts = parseSSMDynamicSecureStringReference(value);
    return aws.ssm
        .getParameterOutput(
            {
                name: parts.parameterName,
                withDecryption: true,
            },
            { parent },
        )
        .apply((v) => {
            switch (v.type) {
                case 'SecureString':
                    return pulumi.secret(v.value);
                default:
                    throw new Error(`Unsupported SSM parameter type: ${v.type}`);
            }
        });
}

/**
 * Used to process a value that may contain a ssm dynamic reference
 *
 * The value may be a pulumi output (typically if the value contains resource references) or a string.
 *
 * @param parent - The parent resource
 * @param value - A fully resolved value that may contain a ssm dynamic reference
 * @returns A secret output if the value is a ssm dynamic reference, otherwise the original value
 */
export function processSSMReferenceValue(parent: pulumi.Resource, value: any): any {
    let returnValue = value;
    if (pulumi.Output.isInstance(value)) {
        returnValue = value.apply((v) => {
            if (typeof v === 'string' && v.startsWith('{{resolve:ssm:')) {
                return resolveSSMDynamicPlaintextReference(parent, v);
            } else if (typeof v === 'string' && v.startsWith('{{resolve:ssm-secure:')) {
                return resolveSSMDynamicSecureStringReference(parent, v);
            }
            return v;
        });
    } else if (typeof value === 'string' && value.startsWith('{{resolve:ssm-secure:')) {
        returnValue = resolveSSMDynamicSecureStringReference(parent, value);
    } else if (typeof value === 'string' && value.startsWith('{{resolve:ssm:')) {
        returnValue = resolveSSMDynamicPlaintextReference(parent, value);
    }
    return returnValue;
}
