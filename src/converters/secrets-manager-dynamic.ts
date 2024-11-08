import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import { containsEventuals } from '../types';

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
export function parseDynamicSecretReference(secret: string): SecretsManagerDynamicReference {
    const match = secret.match(SECRETS_MANAGER_DYNAMIC_REGEX);
    if (match) {
        const [_, secretId, secretString, jsonKey, versionStage, versionId] = match;
        return {
            secretId,
            secretString: secretString || undefined,
            jsonKey: jsonKey || undefined,
            versionStage: versionStage || undefined,
            versionId: versionId || undefined,
        };
    }
    throw new Error(`Invalid Secrets Manager dynamic reference: value: ${secret}`);
}

/**
 * Used to resolve Secrets Manager dynamic references in the form of {{resolve:secretsmanager:secret-id:secret-string:json-key:version-stage:version-id}}
 * This will only work for references that are complete strings, i.e. no unresolved values
 *
 * @param secret - The complete secret reference string
 * @returns The secretsmanager secret value
 */
export function resolveSecretsManagerDynamicReference(parent: pulumi.Resource, secret: string): pulumi.Output<any> {
    // This shouldn't happen because we currently only call this where we know we have a string
    // but adding this for completeness
    if (containsEventuals(secret)) {
        throw new Error('Secrets Manager dynamic references cannot contain unresolved values');
    }
    const parts = parseDynamicSecretReference(secret);
    return aws.secretsmanager
        .getSecretVersionOutput(
            {
                secretId: parts.secretId,
                versionId: parts.versionId,
                versionStage: parts.versionStage,
            },
            { parent },
        )
        .apply((v) => {
            if (parts.jsonKey) {
                const json = JSON.parse(v.secretString);
                return pulumi.secret(json[parts.jsonKey]);
            }
            return pulumi.secret(v.secretString);
        });
}

/**
 * Used to process a value that may contain a secretsmanager dynamic reference
 *
 * The value may be a pulumi output (typically if the value contains resource references) or a string.
 *
 * @param parent - The parent resource
 * @param value - A fully resolved value that may contain a secretsmanager dynamic reference
 * @returns A secret output if the value is a secretsmanager dynamic reference, otherwise the original value
 */
export function processSecretsManagerReferenceValue(parent: pulumi.Resource, value: any): any {
    let returnValue = value;
    if (pulumi.Output.isInstance(value)) {
        returnValue = value.apply((v) => {
            if (typeof v === 'string' && v.startsWith('{{resolve:secretsmanager:')) {
                return resolveSecretsManagerDynamicReference(parent, v);
            }
            return v;
        });
    } else if (typeof value === 'string' && value.startsWith('{{resolve:secretsmanager:')) {
        returnValue = resolveSecretsManagerDynamicReference(parent, value);
    }
    return returnValue;
}
