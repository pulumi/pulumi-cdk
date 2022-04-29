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
import { ecs, iam, apprunner, lambda, s3, s3objectlambda, autoscaling } from '@pulumi/aws-native';
import { CfnElement, Token, Reference, Tokenization } from 'aws-cdk-lib';
import { CfnResource, ResourceMapping, firstToLower, normalize } from './interop';
import { debug } from '@pulumi/pulumi/log';

export function mapToCfnResource(
    element: CfnElement,
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
): ResourceMapping {
    const props = normalize(rawProps);
    debug(`mapToCfnResource typeName: ${typeName} props: ${JSON.stringify(props)}`)
    switch (typeName) {
        case 'AWS::AppRunner::Service':
            return { resource: new apprunner.Service(logicalId, props, options) };
        case 'AWS::ECS::Cluster':
            return { resource: new ecs.Cluster(logicalId, props, options) };
        case 'AWS::ECS::TaskDefinition':
            return { resource: new ecs.TaskDefinition(logicalId, props, options) };
        case 'AWS::IAM::Role': {
            // We need this because IAM Role's CFN json format has the following field in uppercase.
            const morphed: any = {};
            Object.entries(rawProps).forEach(([k, v]) => {
                if (k == 'AssumeRolePolicyDocument') {
                    morphed[firstToLower(k)] = v;
                } else {
                    morphed[k] = v;
                }
            });
            return { resource: new iam.Role(logicalId, morphed, options) };
        }
        case 'AWS::Lambda::Function':
            return new lambda.Function(
                logicalId,
                {
                    ...props,
                    environment:
                        rawProps.Environment === undefined ? undefined : { variables: rawProps.Environment.Variables },
                },
                options,
            );
        case 'AWS::S3::AccessPoint':
            return new s3.AccessPoint(
                logicalId,
                {
                    ...props,
                    environment: rawProps.Environment === undefined ? undefined : { variables: rawProps.Environment.Variables },
                }, options)
            };
        case 'AWS::S3::AccessPoint':
            return {
                resource: new s3.AccessPoint(
                    logicalId,
                    {
                        ...props,
                        policy: rawProps.Policy,
                    },
                    options,
                )
            };
        case 'AWS::S3::Bucket':
            // Lowercase the bucket name to comply with the Bucket resource's naming constraints, which only allow
            // lowercase letters.
            return { resource: new s3.Bucket(logicalId.toLowerCase(), props, options) };
        case 'AWS::S3ObjectLambda::AccessPoint':
            return {
                resource: new s3objectlambda.AccessPoint(
                    logicalId,
                    {
                        name: props.name,
                        objectLambdaConfiguration: {
                            allowedFeatures: props.objectLambdaConfiguration.allowedFeatures,
                            cloudWatchMetricsEnabled: props.objectLambdaConfiguration.cloudWatchMetricsEnabled,
                            supportingAccessPoint: props.objectLambdaConfiguration.supportingAccessPoint,
                            transformationConfigurations:
                                rawProps.ObjectLambdaConfiguration.TransformationConfigurations.map((config: any) => ({
                                    actions: config.Actions,
                                    contentTransformation: config.ContentTransformation,
                                })),
                        },
                    },
                    options,
                )
            };
        default: {
            // Scrape the attributes off of the construct.
            //
            // NOTE: this relies on CfnReference setting the reference's display name to the literal attribute name.
            const attributes = Object.values(element)
                .filter(Token.isUnresolved)
                .flatMap((v) => {
                    if (typeof v === 'string') {
                        return Tokenization.reverseString(v).tokens;
                    }
                    return [Tokenization.reverse(v)];
                })
                .filter(Reference.isReference)
                .filter((ref) => ref.target === element)
                .map((ref) => attributePropertyName(ref.displayName));

            return { resource: new CfnResource(logicalId, typeName, props, attributes, options) };
        }
    }
}

export function attributePropertyName(attributeName: string): string {
    return firstToLower(attributeName.split('.')[0]);
}
