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

import * as pulumi from '@pulumi/pulumi';
import { s3 } from '@pulumi/aws-native';
import { CfnResource, ResourceMapping, normalize } from './interop';
import { debug } from '@pulumi/pulumi/log';
import { toSdkName } from './naming';
import { Metadata } from './pulumi-metadata';
import { PulumiProvider } from './types';

export function mapToCfnResource(
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
): ResourceMapping[] {
    const props = normalize(rawProps, typeName);
    debug(`mapToCfnResource typeName: ${typeName} props: ${JSON.stringify(props)}`);
    switch (typeName) {
        case 'AWS::S3::Bucket':
            // Lowercase the bucket name to comply with the Bucket resource's naming constraints, which only allow
            // lowercase letters.
            return [new s3.Bucket(logicalId.toLowerCase(), props, options)];
        default: {
            // When creating a generic `CfnResource` we don't have any information on the
            // attributes attached to the resource. We need to populate them by looking up the
            // `output` in the metadata
            const metadata = new Metadata(PulumiProvider.AWS_NATIVE);
            const resource = metadata.findResource(typeName);
            const attributes = Object.keys(resource.outputs);

            return [new CfnResource(logicalId, typeName, props, attributes, options)];
        }
    }
}

export function attributePropertyName(attributeName: string): string {
    return toSdkName(attributeName.split('.')[0]);
}
