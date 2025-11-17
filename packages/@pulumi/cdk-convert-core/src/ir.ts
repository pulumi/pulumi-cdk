import { StackAddress } from './assembly';
export type { StackAddress } from './assembly';

/**
 * Full conversion result for a CDK assembly.
 */
export interface ProgramIR {
    stacks: StackIR[];
}

/**
 * Conversion output for a single CDK stack (root or nested).
 */
export interface StackIR {
    /**
     * Absolute construct path for this stack as emitted by the assembly.
     */
    stackPath: string;

    /**
     * Logical identifier (artifact id) for this stack.
     */
    stackId: string;

    /**
     * Resources that belong to this stack.
     */
    resources: ResourceIR[];

    /**
     * Stack outputs exposed by this template.
     */
    outputs?: OutputIR[];

    /**
     * Parameters declared by this template.
     */
    parameters?: ParameterIR[];
}

/**
 * Pulumi-ready description of a CloudFormation resource.
 */
export interface ResourceIR {
    /**
     * Logical ID inside the CloudFormation template.
     */
    logicalId: string;

    /**
     * Original CloudFormation resource type (e.g. AWS::S3::Bucket).
     */
    cfnType: string;

    /**
     * CloudFormation properties after intrinsic resolution but prior to normalization.
     */
    cfnProperties: PropertyMap;

    /**
     * Pulumi type token (e.g. aws-native:s3:Bucket).
     */
    typeToken: string;

    /**
     * Properties after intrinsic resolution/normalization.
     */
    props: PropertyMap;

    /**
     * Relationship metadata that Pulumi would normally encode in ResourceOptions.
     */
    options?: ResourceIROptions;
}

export interface ResourceIROptions {
    /**
     * Logical IDs this resource depends on.
     */
    dependsOn?: StackAddress[];

    /**
     * Whether the resource should be retained on delete operations.
     */
    retainOnDelete?: boolean;
}

export interface OutputIR {
    name: string;
    value: PropertyValue;
    description?: string;
}

export interface ParameterIR {
    name: string;
    type: string;
    default?: PropertyValue;
}

export interface PropertyMap {
    [key: string]: PropertyValue;
}

export type PropertyValue =
    | PrimitiveValue
    | PropertyMap
    | PropertyValue[]
    | ResourceAttributeReference
    | StackOutputReference
    | ParameterReference
    | DynamicReferenceValue
    | ConcatValue;

export type PrimitiveValue = string | number | boolean | null;

export interface ResourceAttributeReference {
    kind: 'resourceAttribute';
    resource: StackAddress;
    attributeName: string;
    propertyName?: string;
}

export interface StackOutputReference {
    kind: 'stackOutput';
    stackPath: string;
    outputName: string;
}

export interface ParameterReference {
    kind: 'parameter';
    stackPath: string;
    parameterName: string;
}

export type DynamicReferenceValue = SsmDynamicReferenceValue | SecretsManagerDynamicReferenceValue;

export interface SsmDynamicReferenceValue {
    kind: 'ssmDynamicReference';
    parameterName: string;
    secure: boolean;
}

export interface SecretsManagerDynamicReferenceValue {
    kind: 'secretsManagerDynamicReference';
    secretId: string;
    secretString?: string;
    jsonKey?: string;
    versionStage?: string;
    versionId?: string;
}

export interface ConcatValue {
    kind: 'concat';
    delimiter: string;
    values: PropertyValue[];
}
