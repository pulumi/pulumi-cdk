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
import * as cdk from 'aws-cdk-lib';
import * as cx from 'aws-cdk-lib/cx-api';
import * as pulumi from '@pulumi/pulumi';
import { debug } from '@pulumi/pulumi/log';
import { StackComponentResource, StackOptions } from './types';
import { AppConverter, StackConverter } from './converters/app-converter';

class StackComponent extends pulumi.ComponentResource implements StackComponentResource {
    /** @internal */
    name: string;

    /** @internal */
    converter: AppConverter;

    /** @internal */
    assemblyDir: string;

    options?: StackOptions;

    constructor(public readonly stack: Stack) {
        super('cdk:index:Stack', stack.node.id, {}, stack.options);
        this.options = stack.options;

        this.name = stack.node.id;

        const assembly = stack.app.synth();
        this.assemblyDir = assembly.directory;
        debug(`ASSEMBLY_DIR: ${this.assemblyDir}`);

        debug(JSON.stringify(debugAssembly(assembly)));

        this.converter = new AppConverter(this);
        this.converter.convert();

        this.registerOutputs(stack.outputs);
    }

    /** @internal */
    registerOutput(outputId: string, output: any) {
        this.stack.outputs[outputId] = pulumi.output(output);
    }
}

/**
 * A Construct that represents an AWS CDK stack deployed with Pulumi.
 *
 * In order to deploy a CDK stack with Pulumi, it must derive from this class. The `synth` method must be called after
 * all CDK resources have been defined in order to deploy the stack (usually, this is done as the last line of the
 * subclass's constructor).
 */
export class Stack extends cdk.Stack {
    // The URN of the underlying Pulumi component.
    urn!: pulumi.Output<pulumi.URN>;
    resolveURN!: (urn: pulumi.Output<pulumi.URN>) => void;
    rejectURN!: (error: any) => void;

    /**
     * The collection of outputs from the AWS CDK Stack represented as Pulumi Outputs.
     * Each CfnOutput defined in the AWS CDK Stack will populate a value in the outputs.
     */
    outputs: { [outputId: string]: pulumi.Output<any> } = {};

    /** @internal */
    app: cdk.App;

    /** @internal */
    options: StackOptions | undefined;

    // The stack's converter. This is used by asOutput in order to convert CDK values to Pulumi Outputs. This is a
    // Promise so users are able to call asOutput before they've called synth. Note that this _does_ make forgetting
    // to call synth a sharper edge: calling asOutput without calling synth will create outputs that never resolve
    // and the program will hang.
    converter!: Promise<StackConverter>;
    resolveConverter!: (converter: StackConverter) => void;
    rejectConverter!: (error: any) => void;

    /**
     * Create and register an AWS CDK stack deployed with Pulumi.
     *
     * @param name The _unique_ name of the resource.
     * @param options A bag of options that control this resource's behavior.
     */
    constructor(name: string, options?: StackOptions) {
        const app = new cdk.App({
            context: {
                // Ask CDK to attach 'aws:asset:*' metadata to resources in generated stack templates. Although this
                // metadata is not currently used, it may be useful in the future to map between assets and the
                // resources with which they are associated. For example, the lambda.Function L2 construct attaches
                // metadata for its Code asset (if any) to its generated CFN resource.
                [cx.ASSET_RESOURCE_METADATA_ENABLED_CONTEXT]: true,

                // Ask CDK to embed 'aws:cdk:path' metadata in resources in generated stack templates. Although this
                // metadata is not currently used, it provides an aditional mechanism by which we can map between
                // constructs and the resources they emit in the CFN template.
                [cx.PATH_METADATA_ENABLE_CONTEXT]: true,
            },
        });

        super(app, name, options?.props);

        this.app = app;
        this.options = options;

        const urnPromise = new Promise((resolve, reject) => {
            this.resolveURN = resolve;
            this.rejectURN = reject;
        });
        this.urn = pulumi.output(urnPromise);

        this.converter = new Promise((resolve, reject) => {
            this.resolveConverter = resolve;
            this.rejectConverter = reject;
        });
    }

    /**
     * Finalize the stack and deploy its resources.
     */
    protected synth() {
        try {
            const component = new StackComponent(this);
            this.resolveURN(component.urn);
            this.resolveConverter(component.converter.stacks.get(this.artifactId)!);
        } catch (e) {
            this.rejectURN(e);
            this.rejectConverter(e);
        }
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

function debugAssembly(assembly: cx.CloudAssembly): any {
    return {
        version: assembly.version,
        directory: assembly.directory,
        runtime: assembly.runtime,
        artifacts: assembly.artifacts.map(debugArtifact),
    };
}

function debugArtifact(artifact: cx.CloudArtifact): any {
    return {
        dependencies: artifact.dependencies.map((artifact) => artifact.id),
        manifest: artifact.manifest,
        messages: artifact.messages,
    };
}
