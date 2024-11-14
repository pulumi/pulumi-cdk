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
import { DEPLOY_TIME_PREFIX, isPulumiSynthesizer } from './synthesizer';
import { debug } from '@pulumi/pulumi/log';

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
        if (!isPulumiSynthesizer(synth)) {
            // todo better error msg
            throw new Error('The stack synthesizer must be a PulumiSynthesizer');
        }

        const stagingBucket = synth.getStagingBucket().bucket;

        return new aws.cloudformation.CustomResourceEmulator(logicalId, {
            stackId: stack.node.id,
            bucketName: stagingBucket,
            bucketKeyPrefix: `${DEPLOY_TIME_PREFIX}pulumi/custom-resources/${logicalId}/`,
            serviceToken: rawProps.ServiceToken,
            resourceType: typeName,
            customResourceProperties: rawProps,
        }, {
            ...options,
            customTimeouts: {
                create: convertToGoDuration(rawProps.ServiceTimeout),
                update: convertToGoDuration(rawProps.ServiceTimeout),
                delete: convertToGoDuration(rawProps.ServiceTimeout),
            },
        });
    }
    
    return undefined;
}

function convertToGoDuration(seconds?: number): string | undefined {
    if (seconds === undefined) {
        return undefined;
    }
    return `${seconds}s`;
}

/**
 * Determines if the given type name corresponds to a custom resource.
 * Custom resources either use AWS::CloudFormation::CustomResource or Custom::MyCustomResourceTypeName for the type.
 * @internal
 */
export function isCustomResource(typeName: string): boolean {
    return typeName === 'AWS::CloudFormation::CustomResource' || typeName.startsWith('Custom::');
}
