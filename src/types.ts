import * as pulumi from '@pulumi/pulumi';
import { Stack, StackProps } from 'aws-cdk-lib/core';
import { ResourceMapping } from './interop';
/**
 * Options specific to the Stack component.
 */
export interface StackOptions extends pulumi.ComponentResourceOptions {
    /**
     * Specify the CDK Stack properties to asociate with the stack.
     */
    props?: StackProps;

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
 * The pulumi provider to read the schema from
 */
export enum PulumiProvider {
    // We currently only support aws-native provider resources
    AWS_NATIVE = 'aws-native',
}

/**
 * StackComponentResource is the underlying pulumi ComponentResource for each pulumicdk.Stack
 * This exists because pulumicdk.Stack needs to extend cdk.Stack, but we also want it to represent a
 * pulumi ComponentResource so we create this `StackComponentResource` to hold the pulumi logic
 */
export abstract class StackComponentResource extends pulumi.ComponentResource {
    public abstract name: string;

    /**
     * The directory to which cdk synthesizes the CloudAssembly
     */
    public abstract assemblyDir: string;

    /**
     * The Stack that creates this component
     */
    public abstract stack: Stack;

    /**
     * Any stack options that are supplied by the user
     * @internal
     */
    public abstract options?: StackOptions;

    /**
     * Register pulumi outputs to the stack
     * @internal
     */
    abstract registerOutput(outputId: string, output: any): void;

    constructor(id: string, options?: pulumi.ComponentResourceOptions) {
        super('cdk:index:Stack', id, {}, options);
    }
}
export type Mapping<T extends pulumi.Resource> = {
    resource: T;
    resourceType: string;
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
