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
import { ecs, iam, apprunner, lambda, s3, s3objectlambda } from '@pulumi/aws-native';
import { CfnResource, firstToLower } from './interop';
import { CfnElement, Token, Reference, Tokenization } from 'aws-cdk-lib';

export function mapToCfnResource(
    element: CfnElement,
    logicalId: string,
    typeName: string,
    rawProps: any,
    props: any,
    options: pulumi.ResourceOptions,
): { [logicalId: string]: pulumi.Resource } {
    switch (typeName) {
        case 'AWS::AppRunner::Service':
            return { [logicalId]: new apprunner.Service(logicalId, props, options) };
        case 'AWS::ECS::Cluster':
            return { [logicalId]: new ecs.Cluster(logicalId, props, options) };
        case 'AWS::ECS::TaskDefinition':
            return { [logicalId]: new ecs.TaskDefinition(logicalId, props, options) };
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
            return { [logicalId]: new iam.Role(logicalId, morphed, options) };
        }
        case 'AWS::Lambda::Function':
            return { [logicalId]: new lambda.Function(logicalId, props, options) };
        case 'AWS::S3::AccessPoint':
            return {
                [logicalId]: new s3.AccessPoint(
                    logicalId,
                    {
                        ...props,
                        policy: rawProps.Policy,
                    },
                    options,
                ),
            };
        case 'AWS::S3::Bucket':
            // Lowercase the bucket name to comply with the Bucket resource's naming constraints, which only allow
            // lowercase letters.
            return { [logicalId]: new s3.Bucket(logicalId.toLowerCase(), props, options) };
        case 'AWS::S3ObjectLambda::AccessPoint':
            return {
                [logicalId]: new s3objectlambda.AccessPoint(
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
                ),
            };
        default: {
            // Scrape the attributes off of the construct.
            //
            // NOTE: this relies on CfnReference setting the reference's display name to the literal attribute name.
            const attributes = Object.values(element)
                .filter(Token.isUnresolved)
                .map((v) => Tokenization.reverse(v))
                .filter(Reference.isReference)
                .filter((ref) => ref.target === element)
                .map((ref) => attributePropertyName(ref.displayName));

            return { [logicalId]: new CfnResource(logicalId, typeName, props, attributes, options) };
        }
    }
}

export function attributePropertyName(attributeName: string): string {
    return firstToLower(attributeName.split('.')[0]);
}
