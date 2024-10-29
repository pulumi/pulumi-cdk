// Copyright 2016-2022, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import * as cdk from 'aws-cdk-lib/core';
import * as pulumi from '@pulumi/pulumi';
import { AppComponent, AppOptions, AppResourceOptions } from './types';
import { AppConverter, StackConverter } from './converters/app-converter';
import { PulumiSynthesizer, PulumiSynthesizerBase } from './synthesizer';
import { AwsCdkCli, ICloudAssemblyDirectoryProducer } from '@aws-cdk/cli-lib-alpha';
import { error } from '@pulumi/pulumi/log';
import { CdkConstruct } from './interop';

export type AppOutputs = { [outputId: string]: pulumi.Output<any> };

const STACK_SYMBOL = Symbol.for('@pulumi/cdk.Stack');

interface AppResource {
    converter: AppConverter;
}

/**
 * A Pulumi CDK App component. This is the entrypoint to your Pulumi CDK application.
 * The second argument is a callback function where all CDK resources must be created.
 *
 * @example
 * import * as s3 from 'aws-cdk-lib/aws-s3';
 * import * as pulumicdk from '@pulumi/cdk';
 *
 * const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
 *   // All resources must be created within a Pulumi Stack
 *   const stack = new pulumicdk.Stack(scope, 'pulumi-stack');
 *   const bucket = new s3.Bucket(stack, 'my-bucket');
 *   return {
 *     bucket: stack.asOutput(bucket.bucketName),
 *   };
 * });
 *
 * export const bucket = app.outputs['bucket'];
 */
export class App
    extends pulumi.ComponentResource<AppResource>
    implements ICloudAssemblyDirectoryProducer, AppComponent
{
    public readonly name: string;

    /**
     * The collection of outputs from the AWS CDK Stack represented as Pulumi Outputs.
     * Each CfnOutput defined in the AWS CDK Stack will populate a value in the outputs.
     */
    public outputs: { [outputId: string]: pulumi.Output<any> } = {};

    /**
     * @internal
     */
    public readonly component: pulumi.ComponentResource;

    /**
     * @internal
     */
    public readonly stacks: { [artifactId: string]: cdk.Stack } = {};

    /** @internal */
    public converter: Promise<AppConverter>;

    /**
     * @internal
     */
    public appOptions?: AppOptions;

    /**
     * The directory to which cdk synthesizes the CloudAssembly
     * @internal
     */
    public assemblyDir!: string;

    /**
     * @internal
     */
    readonly dependencies: CdkConstruct[] = [];

    private readonly createFunc: (scope: App) => AppOutputs | void;
    private _app?: cdk.App;
    private appProps?: cdk.AppProps;

    constructor(id: string, createFunc: (scope: App) => void | AppOutputs, props?: AppResourceOptions) {
        super('cdk:index:App', id, props?.appOptions, props);
        this.appOptions = props?.appOptions;
        this.createFunc = createFunc;
        this.component = this;

        this.name = id;
        this.appProps = props?.appOptions?.props;
        const data = this.getData();
        this.converter = data.then((d) => d.converter);

        // This grabs the outputs off of the stacks themselves after they
        // have been converted. This allows us to present the outputs property
        // as a plain value instead of an Output value.
        const outputs = this.converter.then((converter) => {
            const stacks = Array.from(converter.stacks.values());
            return stacks.reduce(
                (prev, curr) => {
                    const o: { [outputId: string]: pulumi.Output<any> } = {};
                    for (const [outputId, args] of Object.entries(curr.stack.outputs ?? {})) {
                        o[outputId] = curr.processIntrinsics(args.Value);
                    }
                    return {
                        ...prev,
                        ...o,
                    };
                },
                { ...this.outputs } as pulumi.Output<{ [outputId: string]: pulumi.Output<any> }>,
            );
        });
        this.outputs = pulumi.output(outputs);
        this.registerOutputs(this.outputs);
    }

    /**
     * @internal
     */
    public get app(): cdk.App {
        if (!this._app) {
            throw new Error('cdk.App has not been created yet');
        }
        return this._app!;
    }

    protected async initialize(props: {
        name: string;
        args?: AppOptions;
        opts?: pulumi.ComponentResourceOptions;
    }): Promise<AppResource> {
        const cli = AwsCdkCli.fromCloudAssemblyDirectoryProducer(this);
        this.appProps = props.args?.props;
        this.appOptions = props.args;
        try {
            // TODO: support lookups https://github.com/pulumi/pulumi-cdk/issues/184
            await cli.synth({ quiet: true, lookups: false });
        } catch (e: any) {
            if (typeof e.message === 'string' && e.message.includes('Context lookups have been disabled')) {
                const message = e.message as string;
                const messageParts = message.split('Context lookups have been disabled. ');
                const missingParts = messageParts[1].split('Missing context keys: ');
                error(
                    'Context lookups have been disabled. Make sure all necessary context is already in "cdk.context.json". \n' +
                        'Missing context keys: ' +
                        missingParts[1],
                    this,
                );
            } else {
                error(e, this);
            }
        }

        const converter = new AppConverter(this);
        converter.convert();

        return {
            converter,
        };
    }

    /**
     * produce is called by `AwsCdkCli` as part of the `synth` operation. It will potentially
     * be called multiple times if there is any missing context values.
     *
     * @param context The CDK context collected by the CLI that needs to be passed to the cdk.App
     * @returns the path to the CDK Assembly directory
     */
    async produce(context: Record<string, any>): Promise<string> {
        const appId = this.appOptions?.appId ?? generateAppId();
        const synthesizer = this.appProps?.defaultStackSynthesizer ?? new PulumiSynthesizer({ appId, parent: this });

        if (synthesizer instanceof PulumiSynthesizerBase) {
            this.dependencies.push(synthesizer.stagingStack);
        }

        const app = new cdk.App({
            ...(this.appProps ?? {}),
            autoSynth: false,
            analyticsReporting: false,
            // We require tree metadata to walk the construct tree
            treeMetadata: true,
            context,
            defaultStackSynthesizer: synthesizer,
        });
        this._app = app;
        const outputs = this.createFunc(this);
        this.outputs = outputs ?? {};

        app.node.children.forEach((child) => {
            if (Stack.isPulumiStack(child)) {
                this.stacks[child.artifactId] = child;
            }
        });

        const dir = app.synth().directory;
        this.assemblyDir = dir;
        return dir;
    }
}

/**
 * Options for creating a Pulumi CDK Stack
 */
export interface StackOptions extends pulumi.ComponentResourceOptions {
    /**
     * The CDK Stack props
     */
    props?: cdk.StackProps;
}

/**
 * A Construct that represents an AWS CDK stack deployed with Pulumi.
 *
 * In order to deploy a CDK stack with Pulumi, it must derive from this class.
 */
export class Stack extends cdk.Stack {
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
     * The stack's converter. This is used by asOutput in order to convert CDK
     * values to Pulumi Outputs. This is a Promise so users are able to call
     * asOutput before they've called synth.
     *
     * @internal
     */
    public converter: Promise<StackConverter>;

    /**
     * Create and register an AWS CDK stack deployed with Pulumi.
     *
     * @param name The _unique_ name of the resource.
     * @param options A bag of options that control this resource's behavior.
     */
    constructor(app: App, name: string, options?: StackOptions) {
        super(app.app, name, options?.props);
        Object.defineProperty(this, STACK_SYMBOL, { value: true });

        this.converter = app.converter.then((converter) => converter.stacks.get(this.artifactId)!);
    }

    /**
     * Convert a CDK value to a Pulumi Output.
     *
     * @param v A CDK value.
     * @returns A Pulumi Output value.
     */
    public asOutput<T>(v: T): pulumi.Output<pulumi.Unwrap<T>> {
        // NOTE: we hang this method off of Stack b/c we need a context for token resolution. If it were not for
        // pseudos like cdk.Aws.REGION (which have no associated Stack), we would be able to derive the context
        // from the input by crawling for Reference tokens and pulling the Stack off of the referenced construct.
        //
        // The idea of faking a context for values that only contain pseudos is appealing, but runs into trouble
        // due to how these pseudos are translated into resolved values. Each pseudo is resolved via a call to some
        // AWS provider function, and it would be confusing if the provider that was used was not the same as that
        // used for the stack that is exporting the value (imagine a stack that is deployed to a different region
        // than that used by the default provider--using a fake global context would necessarily use the default
        // provider or would require unintuitive options in order to produce the expected result).
        return pulumi.output(this.converter.then((converter) => converter.asOutputValue(v)));
    }
}

/**
 * Generate a unique app id based on the project and stack. We need some uniqueness
 * in case multiple stacks/projects are deployed to the same AWS environment.
 *
 * This will be used in resource names (e.g. S3 Bucket names) so there
 * are some limitations.
 */
function generateAppId(): string {
    const stack = pulumi.runtime.getStack();
    const project = pulumi.runtime.getProject();
    return `${project}-${stack}`
        .toLowerCase()
        .replace(/[^a-z0-9-.]/g, '-')
        .slice(-17);
}
