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
import * as aws from '@pulumi/aws';
import { ResourceMapping } from './interop';
import { Stack } from 'aws-cdk-lib/core';
import { isPulumiSynthesizer } from './synthesizer';
import { debug } from '@pulumi/pulumi/log';
import { CfnCustomResource } from './custom-resource/custom-resource-emulator'

export function mapToCustomResource(
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
    stack: Stack,
): ResourceMapping[] | undefined {
    debug(`mapToCustomResource typeName: ${typeName} props: ${JSON.stringify(rawProps)}`);

    if (isCustomResource(typeName)) {
        const synth = stack.synthesizer;
        if (!isPulumiSynthesizer(synth)) {
            // todo better error msg
            throw new Error('The stack synthesizer must be a PulumiSynthesizer');
        }

        const stagingBucket = synth.getStagingBucket().bucket;

        return [new CfnCustomResource(logicalId, {
            stackId: stack.node.id,
            stagingBucket: stagingBucket,
            // todo assert those are set
            lambdaArn: rawProps.ServiceToken,
            timeout: rawProps.ServiceTimeout,
            resourceType: typeName,
            logicalId: logicalId,
            // CloudFormation passes all properties as strings, so we need to do that as well
            properties: pulumi.output(rawProps).apply(props => {
                delete props.ServiceToken;
                delete props.ServiceTimeout;
                return convertScalarsToString(props);
            }),
        }, options)];
    }
    
    return undefined;
}

function convertScalarsToString(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(convertScalarsToString);
    } else if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, convertScalarsToString(value)])
        );
    } else if (typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'string') {
        return String(obj);
    }
    return obj; // For other types like functions or undefined, return as is
}


/**
 * Determines if the given type name corresponds to a custom resource.
 * Custom resources either use AWS::CloudFormation::CustomResource or Custom::MyCustomResourceTypeName for the type.
 * @internal
 */
export function isCustomResource(typeName: string): boolean {
    return typeName === 'AWS::CloudFormation::CustomResource' || typeName.startsWith('Custom::');
}
