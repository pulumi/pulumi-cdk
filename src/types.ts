import * as pulumi from '@pulumi/pulumi';
import { Stack, AppProps } from 'aws-cdk-lib/core';
import { CdkConstruct, ResourceMapping } from './interop';

/**
 * Options for creating a Pulumi CDK App Component
 */
export interface AppOptions {
    /**
     * Specify the CDK Stack properties to asociate with the stack.
     */
    props?: AppProps;

    /**
     * A unique identifier for the application that the asset staging stack belongs to.
     *
     * This identifier will be used in the name of staging resources
     * created for this application, and should be unique across apps.
     *
     * The identifier should include lowercase characters, numbers, periods (.) and dashes ('-') only
     * and have a maximum of 17 characters.
     *
     * @default - generated from the pulumi project and stack name
     */
    appId?: string;

    /**
     * Defines a mapping to override and/or provide an implementation for a CloudFormation resource
     * type that is not (yet) implemented in the AWS Cloud Control API (and thus not yet available in
     * the Pulumi AWS Native provider). Pulumi code can override this method to provide a custom mapping
     * of CloudFormation elements and their properties into Pulumi CustomResources, commonly by using the
     * AWS Classic provider to implement the missing resource.
     *
     * @param logicalId The logical ID of the resource being mapped.
     * @param typeName The CloudFormation type name of the resource being mapped.
     * @param props The bag of input properties to the CloudFormation resource being mapped.
     * @param options The set of Pulumi ResourceOptions to apply to the resource being mapped.
     * @returns An object containing one or more logical IDs mapped to Pulumi resources that must be
     * created to implement the mapped CloudFormation resource, or else undefined if no mapping is
     * implemented.
     */
    remapCloudControlResource?(
        logicalId: string,
        typeName: string,
        props: any,
        options: pulumi.ResourceOptions,
    ): ResourceMapping | undefined;
}

/**
 * Options specific to the Pulumi CDK App component.
 */
export interface AppResourceOptions extends pulumi.ComponentResourceOptions {
    appOptions?: AppOptions;
}

/**
 * The Pulumi provider to read the schema from
 */
export enum PulumiProvider {
    // We currently only support aws-native provider resources
    AWS_NATIVE = 'aws-native',
}

/**
 * AppComponent is the interface representing the Pulumi CDK App Component Resource
 */
export interface AppComponent {
    /**
     * The name of the component
     */
    readonly name: string;

    /**
     * The directory to which cdk synthesizes the CloudAssembly
     * @internal
     */
    assemblyDir: string;

    /**
     * The CDK stack associated with the component resource
     * @internal
     */
    readonly stacks: { [artifactId: string]: Stack };

    /**
     * The Pulumi ComponentResourceOptions associated with the stack
     * @internal
     */
    readonly stackOptions: { [artifactId: string]: pulumi.ComponentResourceOptions };

    /**
     * The underlying ComponentResource
     * @internal
     */
    readonly component: pulumi.ComponentResource;

    /**
     * The AppOptions for this component
     * @internal
     */
    appOptions?: AppOptions;

    /**
     * The Resources that the component resource depends on
     * This will typically be the staging resources
     *
     * @internal
     */
    readonly dependencies: CdkConstruct[];
}

/**
 * Represents a mapping from a CloudFormation resource to a Pulumi resource
 */
export type Mapping<T extends pulumi.Resource> = {
    /**
     * The main resource that is being mapped.
     * This Pulumi resource will have a `name` that matches the `logicalId`
     * of the CloudFormation resource
     */
    resource: T;

    /**
     * The CFN Resource type that is being mapped
     */
    resourceType: string;

    /**
     * Other resources that are created as part of the mapping.
     * For example, the AWS::IAM::Policy resource will also create
     * aws.RolePolicyAttachment, aws.GroupPolicyAttachment, and aws.UserPolicyAttachment
     * resources
     */
    otherResources?: T[];

    /**
     * Override the attributes that are available on the mapped resource.
     * This is useful for when the attributes of the CFN resource do not match
     * the attributes of the Pulumi resource, e.g. the CFN resource has an attribute
     * called `resourceArn` and the Pulumi resource has an attribute called `arn`
     * you would provide { attributes: { resourceArn: mappedResource.arn } }
     */
    attributes?: { [name: string]: pulumi.Input<any> };
};

export function containsEventuals(v: any): boolean {
    if (typeof v !== 'object') {
        return false;
    }

    if (v instanceof Promise || pulumi.Output.isInstance(v)) {
        return true;
    }

    if (Array.isArray(v)) {
        return v.some((e) => containsEventuals(e));
    }

    return Object.values(v).some((e) => containsEventuals(e));
}

export function lift(f: (args: any) => any, args: any): any {
    if (!containsEventuals(args)) {
        return f(args);
    }
    return pulumi.all(args).apply(f);
}

/**
 * This can be used to get the attributes from a resource to return as part
 * of the ResourceMapping
 */
export function getAttributesFromResource(resource: pulumi.Resource): { [key: string]: any } {
    return Object.entries(resource).reduce((prev, [k, v]) => {
        return {
            ...prev,
            [k]: v,
        };
    }, {});
}

/**
 * Custom error class to control error formats
 *
 * @internal
 */
export class CdkAdapterError extends Error {
    constructor(message: string) {
        super(`[CDK Adapter] ${message}`);
    }
}
