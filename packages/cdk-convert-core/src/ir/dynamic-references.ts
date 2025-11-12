import {
    DynamicReferenceValue,
    SsmDynamicReferenceValue,
    SecretsManagerDynamicReferenceValue,
} from '../ir';

const SSM_PLAINTEXT_DYNAMIC_REGEX = /^{{resolve:ssm:([a-zA-Z0-9_.\-/]+(?::\d+)?)}}$/;
const SSM_SECURE_DYNAMIC_REGEX = /^{{resolve:ssm-secure:([a-zA-Z0-9_.\-/]+(?::\d+)?)}}$/;

const SECRETS_MANAGER_DYNAMIC_REGEX =
    /\{\{resolve:secretsmanager:([^:]+(?::[^:]+)*?)(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?\}\}/;

export function tryParseDynamicReference(value: string): DynamicReferenceValue | undefined {
    const secureSsm = parseSsmSecureReference(value);
    if (secureSsm) {
        return secureSsm;
    }

    const plaintextSsm = parseSsmPlaintextReference(value);
    if (plaintextSsm) {
        return plaintextSsm;
    }

    const secret = parseSecretsManagerReference(value);
    if (secret) {
        return secret;
    }

    return undefined;
}

function parseSsmPlaintextReference(value: string): SsmDynamicReferenceValue | undefined {
    const match = value.match(SSM_PLAINTEXT_DYNAMIC_REGEX);
    if (!match) {
        return undefined;
    }

    return {
        kind: 'ssmDynamicReference',
        parameterName: match[1],
        secure: false,
    };
}

function parseSsmSecureReference(value: string): SsmDynamicReferenceValue | undefined {
    const match = value.match(SSM_SECURE_DYNAMIC_REGEX);
    if (!match) {
        return undefined;
    }

    return {
        kind: 'ssmDynamicReference',
        parameterName: match[1],
        secure: true,
    };
}

function parseSecretsManagerReference(value: string): SecretsManagerDynamicReferenceValue | undefined {
    const match = value.match(SECRETS_MANAGER_DYNAMIC_REGEX);
    if (!match) {
        return undefined;
    }

    const [_, secretId, secretString, jsonKey, versionStage, versionId] = match;
    return {
        kind: 'secretsManagerDynamicReference',
        secretId,
        secretString: secretString || undefined,
        jsonKey: jsonKey || undefined,
        versionStage: versionStage || undefined,
        versionId: versionId || undefined,
    };
}
