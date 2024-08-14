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
import { iam, lambda, s3, s3objectlambda } from '@pulumi/aws-native';
import { CfnElement, Token, Reference, Tokenization } from 'aws-cdk-lib';
import { CfnResource, ResourceMapping, normalize } from './interop';
import { debug } from '@pulumi/pulumi/log';
import { toSdkName } from './naming';

export function mapToCfnResource(
    element: CfnElement,
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
): ResourceMapping {
    const props = normalize(rawProps);
    debug(`mapToCfnResource typeName: ${typeName} props: ${JSON.stringify(props)}`);
    switch (typeName) {
        case 'AWS::IAM::Role': {
            // policyDocument and assumeRolePolicyDocument are both Json types
            // so we need the raw names
            return new iam.Role(
                logicalId,
                {
                    ...props,
                    policies:
                        rawProps.Policies === undefined
                            ? undefined
                            : rawProps.Policies.flatMap((policy: any) => {
                                  return {
                                      policyName: policy.PolicyName,
                                      policyDocument: policy.PolicyDocument,
                                  };
                              }),
                    assumeRolePolicyDocument: rawProps.AssumeRolePolicyDocument,
                },
                options,
            );
        }
        case 'AWS::Lambda::Function':
            // The Environment.Variables property is a Json type so we need
            // the raw names
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
            // the policy property is a Json type so we need the raw names
            return new s3.AccessPoint(
                logicalId,
                {
                    ...props,
                    policy: rawProps.Policy,
                },
                options,
            );
        case 'AWS::S3::Bucket':
            // Lowercase the bucket name to comply with the Bucket resource's naming constraints, which only allow
            // lowercase letters.
            return new s3.Bucket(logicalId.toLowerCase(), props, options);
        case 'AWS::S3ObjectLambda::AccessPoint': {
            const transformations = rawProps.ObjectLambdaConfiguration.TransformationConfigurations;
            return new s3objectlambda.AccessPoint(
                logicalId,
                {
                    name: props.name,
                    objectLambdaConfiguration: {
                        allowedFeatures: props.objectLambdaConfiguration.allowedFeatures,
                        cloudWatchMetricsEnabled: props.objectLambdaConfiguration.cloudWatchMetricsEnabled,
                        supportingAccessPoint: props.objectLambdaConfiguration.supportingAccessPoint,
                        transformationConfigurations:
                            transformations === undefined
                                ? undefined
                                : transformations.map((config: any) => ({
                                      actions: config.Actions,
                                      contentTransformation: {
                                          awsLambda: {
                                              functionArn: config.ContentTransformation.AwsLambda.FunctionArn,
                                              // functionPayload is a Json type so we need the raw value
                                              functionPayload: config.ContentTransformation.AwsLambda.FunctionPayload,
                                          },
                                      },
                                  })),
                    },
                },
                options,
            );
        }
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

            return new CfnResource(logicalId, typeName, props, attributes, options);
        }
    }
}

export function attributePropertyName(attributeName: string): string {
    return toSdkName(attributeName.split('.')[0]);
}
