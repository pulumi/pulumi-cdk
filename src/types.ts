import * as pulumi from '@pulumi/pulumi';
import { Stack, StackProps, AppProps, App } from 'aws-cdk-lib/core';
import { CdkConstruct, ResourceMapping } from './interop';
const STACK_SYMBOL = Symbol.for('@pulumi/cdk.Stack');

export abstract class PulumiStack extends Stack {
    /**
     * Return whether the given object is a Stack.
     *
     * We do attribute detection since we can't reliably use 'instanceof'.
     * @internal
     */
    public static isPulumiStack(x: any): x is Stack {
        return x !== null && typeof x === 'object' && STACK_SYMBOL in x;
    }
    /**
     * The collection of outputs from the AWS CDK Stack represented as Pulumi Outputs.
     * Each CfnOutput defined in the AWS CDK Stack will populate a value in the outputs.
     */
    public readonly outputs: { [outputId: string]: pulumi.Output<any> } = {};

    constructor(app: App, name: string, options?: StackProps) {
        super(app, name, options);
        Object.defineProperty(this, STACK_SYMBOL, { value: true });
    }
    /** @internal */
    registerOutput(outputId: string, output: any) {
        this.outputs[outputId] = pulumi.output(output);
    }
}

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
    ): ResourceMapping[] | undefined;
}
/**
 * Options specific to the Stack component.
 */
export interface AppResourceOptions extends pulumi.ComponentResourceOptions {
    appOptions?: AppOptions;
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
export interface AppComponent {
    readonly name: string;
    /**
     * The directory to which cdk synthesizes the CloudAssembly
     * @internal
     */
    assemblyDir: string;

    /**
     * The CDK stack associated with the component resource
     */
    readonly stacks: { [artifactId: string]: PulumiStack };

    /**
     * @internal
     */
    readonly component: pulumi.ComponentResource;

    /**
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
