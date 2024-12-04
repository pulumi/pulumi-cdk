import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

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
export function parseSSMDynamicSecureStringReference(value: string): SSMDynamicReference | undefined {
    const match = value.match(SSM_SECURE_DYNAMIC_REGEX);
    if (!match) {
        return undefined;
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
export function parseSSMDynamicPlaintextReference(value: string): SSMDynamicReference | undefined {
    const match = value.match(SSM_PLAINTEXT_DYNAMIC_REGEX);
    if (!match) {
        return undefined;
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
    plainText: SSMDynamicReference,
): pulumi.Output<string | string[]> {
    return aws.ssm
        .getParameterOutput(
            {
                name: plainText.parameterName,
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
export function resolveSSMDynamicSecureStringReference(
    parent: pulumi.Resource,
    secureString: SSMDynamicReference,
): pulumi.Output<string> {
    return aws.ssm
        .getParameterOutput(
            {
                name: secureString.parameterName,
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
 * The regular expression used to match a Secrets Manager dynamic reference.
 *
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-secretsmanager.html
 */
const SECRETS_MANAGER_DYNAMIC_REGEX =
    //                            secret-id        secret-string  json-key    version-stage version-id
    /\{\{resolve:secretsmanager:([^:]+(?::[^:]+)*?)(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?\}\}/;

export interface SecretsManagerDynamicReference {
    /**
     * The name or ARN of the secret.
     *
     * To access a secret in your AWS account, you need only specify the secret name.
     * To access a secret in a different AWS account, specify the complete ARN of the secret.
     */
    secretId: string;

    /**
     * Currently, the only supported value is SecretString. The default is SecretString.
     */
    secretString?: string;

    /**
     * The key name of the key-value pair whose value you want to retrieve.
     * If you don't specify a json-key, CloudFormation retrieves the entire secret text.
     *
     * This segment may not include the colon character ( :).
     */
    jsonKey?: string;

    /**
     * The staging label of the version of the secret to use.
     * If you use version-stage then don't specify version-id.
     * If you don't specify either version-stage or version-id, then the default is the AWSCURRENT version.
     *
     * This segment may not include the colon character ( :).
     */
    versionStage?: string;

    /**
     * The unique identifier of the version of the secret to use.
     * If you specify version-id, then don't specify version-stage.
     * If you don't specify either version-stage or version-id, then the default is the AWSCURRENT version.
     *
     * This segment may not include the colon character ( :).
     */
    versionId?: string;
}

/**
 * Parses a secretsmanager dynamic reference into its components. This function should be used to resolve
 * references that are complete strings, i.e. no unresolved values
 *
 * @see https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-secretsmanager.html
 *
 * @param secret - The secretsmanager dynamic reference, i.e. {{resolve:secretsmanager:secret-id:secret-string:json-key:version-stage:version-id}}
 * @returns the matched secret reference
 */
export function parseDynamicSecretReference(secret: string): SecretsManagerDynamicReference | undefined {
    const match = secret.match(SECRETS_MANAGER_DYNAMIC_REGEX);
    if (!match) {
        return undefined;
    }
    const [_, secretId, secretString, jsonKey, versionStage, versionId] = match;
    return {
        secretId,
        secretString: secretString || undefined,
        jsonKey: jsonKey || undefined,
        versionStage: versionStage || undefined,
        versionId: versionId || undefined,
    };
}

/**
 * Used to resolve Secrets Manager dynamic references in the form of {{resolve:secretsmanager:secret-id:secret-string:json-key:version-stage:version-id}}
 * This will only work for references that are complete strings, i.e. no unresolved values
 *
 * @param secret - The complete secret reference string
 * @returns The secretsmanager secret value
 */
export function resolveSecretsManagerDynamicReference(
    parent: pulumi.Resource,
    secret: SecretsManagerDynamicReference,
): pulumi.Output<any> {
    return aws.secretsmanager
        .getSecretVersionOutput(
            {
                secretId: secret.secretId,
                versionId: secret.versionId,
                versionStage: secret.versionStage,
            },
            { parent },
        )
        .apply((v) => {
            if (secret.jsonKey) {
                const json = JSON.parse(v.secretString);
                return pulumi.secret(json[secret.jsonKey]);
            }
            return pulumi.secret(v.secretString);
        });
}

/**
 * This function can parse values and perform custom logic based on what the string contains
 * For example, if the string contains an SSM or SecretsManager dynamic reference then it can resolve
 * those references to their corresponding values
 *
 * @param parent - The parent resource for any function calls
 * @param value - The value which may contain a dynamic reference
 * @returns The resolved value
 */
export function parseDynamicValue(parent: pulumi.Resource, value: any): any {
    const f = (value: any) => {
        if (typeof value === 'string') {
            const secretValue = parseDynamicSecretReference(value);
            if (secretValue) {
                return resolveSecretsManagerDynamicReference(parent, secretValue);
            }

            const plainText = parseSSMDynamicPlaintextReference(value);
            if (plainText) {
                return resolveSSMDynamicPlaintextReference(parent, plainText);
            }

            const secureString = parseSSMDynamicSecureStringReference(value);
            if (secureString) {
                return resolveSSMDynamicSecureStringReference(parent, secureString);
            }
            return value;
        } else {
            return value;
        }
    };

    if (value instanceof Promise || pulumi.Output.isInstance(value)) {
        return pulumi.all(value as any).apply(f);
    }
    return f(value);
}
