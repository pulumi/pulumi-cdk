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
import * as aws from '@pulumi/aws';
import { AppComponent, AppOptions, AppResourceOptions, CdkAdapterError } from './types';
import { AppConverter, StackConverter } from './converters/app-converter';
import { PulumiSynthesizer, PulumiSynthesizerBase } from './synthesizer';
import { AwsCdkCli, ICloudAssemblyDirectoryProducer } from '@aws-cdk/cli-lib-alpha';
import { CdkConstruct } from './interop';
import { makeUniqueId } from './cdk-logical-id';
import * as native from '@pulumi/aws-native';
import { warn } from '@pulumi/pulumi/log';

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

    /**
     * The Pulumi ComponentResourceOptions associated with the stack
     * @internal
     */
    readonly stackOptions: { [artifactId: string]: pulumi.ComponentResourceOptions } = {};

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
    private _env?: cdk.Environment;
    private appProps?: cdk.AppProps;

    constructor(id: string, createFunc: (scope: App) => void | AppOutputs, props?: AppResourceOptions) {
        super('cdk:index:App', id, props?.appOptions, {
            ...props,
            providers: createDefaultNativeProvider(props?.providers),
        });
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
                    for (const [outputId, args] of Object.entries(curr.stack.getRootStack().Outputs ?? {})) {
                        o[outputId] = curr.processIntrinsics(args.Value, curr.stack.id);
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
     * This can be used to get the CDK Environment based on the Pulumi Provider used for the App.
     * You can then use this to configure an explicit environment on Stacks.
     *
     * @example
     * const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
     *     const stack = new pulumicdk.Stack(scope, 'pulumi-stack', {
     *         props: { env: app.env },
     *     });
     * });
     *
     * @returns the CDK Environment configured for the App
     */
    public get env(): cdk.Environment {
        if (!this._env) {
            throw new CdkAdapterError('cdk.Environment has not been created yet');
        }
        return this._env;
    }

    /**
     * @internal
     */
    public get app(): cdk.App {
        if (!this._app) {
            throw new CdkAdapterError('cdk.App has not been created yet');
        }
        return this._app;
    }

    protected async initialize(props: {
        name: string;
        args?: AppOptions;
        opts?: pulumi.ComponentResourceOptions;
    }): Promise<AppResource> {
        const cli = AwsCdkCli.fromCloudAssemblyDirectoryProducer(this);
        this.appProps = props.args?.props;
        this.appOptions = props.args;
        const lookupsEnabled = process.env.PULUMI_CDK_EXPERIMENTAL_LOOKUPS === 'true';
        const lookups = lookupsEnabled && pulumi.runtime.isDryRun();
        const [account, region] = await Promise.all([
            native
                .getAccountId({
                    parent: this,
                    ...props.opts,
                })
                .then((account) => account.accountId),
            native.getRegion({ parent: this, ...props.opts }).then((region) => region.region),
        ]);
        this._env = {
            account,
            region,
        };
        try {
            // TODO: support lookups https://github.com/pulumi/pulumi-cdk/issues/184
            await cli.synth({ quiet: true, lookups });
        } catch (e: any) {
            if (typeof e.message === 'string' && e.message.includes('Context lookups have been disabled')) {
                const message = e.message as string;
                const messageParts = message.split('Context lookups have been disabled. ');
                const missingParts = messageParts[1].split('Missing context keys: ');
                throw new CdkAdapterError(
                    'Context lookups have been disabled. Make sure all necessary context is already in "cdk.context.json". ' +
                        'Or set "PULUMI_CDK_EXPERIMENTAL_LOOKUPS" to true. \n' +
                        'Missing context keys: ' +
                        missingParts[1],
                );
            }
            throw e;
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
     * Note: currently lookups are disabled so this will only be executed once
     *
     * @hidden
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
                if (child.options) {
                    this.stackOptions[child.artifactId] = child.options;
                }
            }
        });

        const dir = app.synth().directory;
        this.assemblyDir = dir;
        return dir;
    }
}

/**
 * Options for creating a Pulumi CDK Stack
 *
 * Any Pulumi resource options provided at the Stack level will override those configured
 * at the App level
 *
 * @example
 * new App('testapp', (scope: App) => {
 *     // This stack will inherit the options from the App
 *     new Stack(scope, 'teststack1');
 *
 *    // Override the options for this stack
 *    new Stack(scope, 'teststack', {
 *        providers: [
 *          new native.Provider('custom-provider', { region: 'us-east-1' }),
 *        ],
 *        props: { env: { region: 'us-east-1' } },
 *    })
 * }, {
 *      providers: [
 *          new native.Provider('app-provider', { region: 'us-west-2' }),
 *      ]
 *
 * })
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
     * @internal
     */
    public options?: pulumi.ComponentResourceOptions;

    /**
     * Create and register an AWS CDK stack deployed with Pulumi.
     *
     * @param name The _unique_ name of the resource.
     * @param options A bag of options that control this resource's behavior.
     */
    constructor(private readonly app: App, name: string, options?: StackOptions) {
        super(app.app, name, options?.props);
        Object.defineProperty(this, STACK_SYMBOL, { value: true });

        this.options = options;
        this.converter = app.converter.then((converter) => converter.stacks.get(this.artifactId)!);

        this.validateEnv();
    }

    /**
     * This function validates that the user has correctly configured the stack environment. There are two
     * ways that the environment comes into play in a Pulumi CDK application. When resources are created
     * they are created with a specific provider that is either inherited from the Stack or the App. There
     * are some values though that CDK generates based on what environment is passed to the StackProps.
     *
     * Below is an example of something a user could configure (by mistake).
     *
     * @example
     * new App('testapp', (scope: App) => {
     *    new Stack(scope, 'teststack', {
     *        providers: [
     *          new native.Provider('native-provider', { region: 'us-east-1' }),
     *        ],
     *        props: { env: { region: 'us-east-2' }},
     *    })
     * }, {
     *      providers: [
     *          new native.Provider('native-provider', { region: 'us-west-2' }),
     *      ]
     *
     * })
     */
    private validateEnv(): void {
        const providers = providersToArray(this.options?.providers);
        const nativeProvider = providers.find((p) => native.Provider.isInstance(p));
        const awsProvider = providers.find((p) => aws.Provider.isInstance(p));

        const awsRegion = aws.getRegionOutput({}, { parent: this.app, provider: awsProvider }).name;
        const awsAccount = aws.getCallerIdentityOutput({}, { parent: this.app, provider: awsProvider }).accountId;
        const nativeRegion = native.getRegionOutput({ parent: this.app, provider: nativeProvider }).region;
        const nativeAccount = native.getAccountIdOutput({ parent: this.app, provider: nativeProvider }).accountId;

        pulumi
            .all([awsRegion, awsAccount, nativeRegion, nativeAccount])
            .apply(([awsRegion, awsAccount, nativeRegion, nativeAccount]) => {
                // This is to ensure that the user does not pass a different region to the provider and the stack environment.
                if (!cdk.Token.isUnresolved(this.region) && nativeRegion !== this.region) {
                    throw new CdkAdapterError(
                        `The stack '${this.node.id}' has conflicting regions between the native provider (${nativeRegion}) and the stack environment (${this.region}).\n` +
                            'Please ensure that the stack environment region matches the region of the native provider.',
                    );
                }

                if (!cdk.Token.isUnresolved(this.account) && this.account !== nativeAccount) {
                    throw new CdkAdapterError(
                        `The stack '${this.node.id}' has conflicting accounts between the native provider (${nativeAccount}) and the stack environment (${this.account}).\n` +
                            'Please ensure that the stack environment account matches the account of the native provider.',
                    );
                }

                if (nativeAccount !== awsAccount) {
                    warn(
                        `[CDK Adapter] The stack '${this.node.id}' uses different accounts for the AWS Provider (${awsAccount}) and the AWS CCAPI Provider (${nativeAccount}). This may be a misconfiguration.`,
                        this.app,
                    );
                }
                if (nativeRegion !== awsRegion) {
                    warn(
                        `[CDK Adapter] The stack '${this.node.id}' uses different regions for the AWS Provider (${awsRegion}) and the AWS CCAPI Provider (${nativeRegion}). This may be a misconfiguration.`,
                        this.app,
                    );
                }
            });
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

    /**
     * Returns the naming scheme used to allocate logical IDs. This overrides the default method
     *
     * If the "human" part of the ID exceeds 240 characters, we simply trim it so
     * the total ID doesn't exceed CloudFormation's 255 character limit.
     *
     * When Pulumi auto names the resource it will add an 8 character random identifier to the end
     *
     * Special cases:
     *
     * - For aesthetic reasons, if the last components of the path are the same
     *   (i.e. `L1/L2/Pipeline/Pipeline`), they will be de-duplicated to make the
     *   resulting human portion of the ID more pleasing: `L1L2Pipeline`
     *   instead of `L1L2PipelinePipeline`
     * - If a component is named "Default" it will be omitted from the path. This
     *   allows refactoring higher level abstractions around constructs without affecting
     *   the IDs of already deployed resources.
     * - If a component is named "Resource" it will be omitted from the user-visible
     *   path. This reduces visual noise in the human readable
     *   part of the identifier.
     *
     * @param cfnElement The element for which the logical ID is allocated.
     */
    protected allocateLogicalId(cfnElement: cdk.CfnElement): string {
        const scopes = cfnElement.node.scopes;
        const stackIndex = scopes.indexOf(cfnElement.stack);
        const pathComponents = scopes.slice(stackIndex + 1).map((x) => x.node.id);
        return makeUniqueId(pathComponents);
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

function providersToArray(
    providers: pulumi.ProviderResource[] | Record<string, pulumi.ProviderResource> | undefined,
): pulumi.ProviderResource[] {
    return providers && !Array.isArray(providers) ? Object.values(providers) : providers ?? [];
}

/**
 * If the user has not provided the aws-native provider, we will create one by default in order
 * to enable the autoNaming feature.
 */
function createDefaultNativeProvider(
    providers?: pulumi.ProviderResource[] | Record<string, pulumi.ProviderResource>,
): pulumi.ProviderResource[] {
    // This matches the logic found in aws-native. If all of these are undefined the provider
    // will throw an error
    const region = native.config.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION!;

    const newProviders = providersToArray(providers);
    if (!newProviders.find((p) => native.Provider.isInstance(p))) {
        newProviders.push(
            new native.Provider('cdk-aws-native', {
                region: region as native.Region,
                autoNaming: {
                    randomSuffixMinLength: 7,
                    autoTrim: true,
                },
            }),
        );
    }
    return newProviders;
}
