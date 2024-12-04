// Copyright 2016-2024, Pulumi Corporation.
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

import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws-native';
import { ResourceMapping } from './interop';
import { Stack } from 'aws-cdk-lib/core';
import { PulumiSynthesizerBase } from './synthesizer';
import { debug } from '@pulumi/pulumi/log';
import { CdkAdapterError } from './types';

export function mapToCustomResource(
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
    stack: Stack,
): ResourceMapping | undefined {
    debug(`mapToCustomResource typeName: ${typeName} props: ${JSON.stringify(rawProps)}`);

    if (isCustomResource(typeName)) {
        const synth = stack.synthesizer;
        if (!(synth instanceof PulumiSynthesizerBase)) {
            throw new CdkAdapterError(
                `Synthesizer of stack ${stack.node.id} does not support custom resources. It must inherit from ${PulumiSynthesizerBase.name}.`,
            );
        }

        const stagingBucket = synth.getStagingBucket();
        const stackId = stack.node.id;

        return new aws.cloudformation.CustomResourceEmulator(
            logicalId,
            {
                stackId: stack.node.id,
                bucketName: stagingBucket,
                bucketKeyPrefix: `${synth.getDeployTimePrefix()}pulumi/custom-resources/${stackId}/${logicalId}`,
                serviceToken: rawProps.ServiceToken,
                resourceType: typeName,
                customResourceProperties: rawProps,
            },
            {
                ...options,
                customTimeouts: convertToCustomTimeouts(rawProps.ServiceTimeout),
            },
        );
    }

    return undefined;
}

function convertToCustomTimeouts(seconds?: number): pulumi.CustomTimeouts | undefined {
    if (seconds === undefined) {
        return undefined;
    }
    const duration = `${seconds}s`;
    return {
        create: duration,
        update: duration,
        delete: duration,
    };
}

/**
 * Determines if the given type name corresponds to a custom resource.
 * Custom resources either use AWS::CloudFormation::CustomResource or Custom::MyCustomResourceTypeName for the type.
 */
function isCustomResource(typeName: string): boolean {
    return typeName === 'AWS::CloudFormation::CustomResource' || typeName.startsWith('Custom::');
}
