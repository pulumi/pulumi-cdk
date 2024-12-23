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
import { CdkAdapterError, getAttributesFromResource } from './types';
import * as aws from '@pulumi/aws-native';
import { ResourceMapping, normalize } from './interop';
import { debug } from '@pulumi/pulumi/log';
import { toSdkName, typeName as pulumiTypeName, moduleName } from './naming';

export function mapToCfnResource(
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
): ResourceMapping {
    const props = normalize(rawProps, typeName);
    debug(`mapToCfnResource typeName: ${typeName} props: ${JSON.stringify(props)}`);
    switch (typeName) {
        case 'AWS::S3::Bucket':
            // Lowercase the bucket name to comply with the Bucket resource's naming constraints, which only allow
            // lowercase letters.
            return new aws.s3.Bucket(logicalId.toLowerCase(), props, options);

        case 'AWS::S3::AccessPoint':
            // Lowercase the access point to comply with the resource's naming constraints, which only allow
            // lowercase letters.
            return new aws.s3.AccessPoint(logicalId.toLowerCase(), props, options);

        case 'AWS::ECR::Repository':
            // Lowercase the repository name to comply with the Repository resource's naming constraints, which only allow
            // lowercase letters.
            return new aws.ecr.Repository(logicalId.toLowerCase(), props, options);

        // A couple of ApiGateway resources suffer from https://github.com/pulumi/pulumi-cdk/issues/173
        // These are very popular resources so handling the workaround here since we can remove these
        // manual mappings once the issue has been fixed without breaking users
        case 'AWS::ApiGateway::Model': {
            const res = new aws.apigateway.Model(logicalId, props, options);

            return {
                resource: res,
                attributes: {
                    ...getAttributesFromResource(res),
                    id: res.name,
                },
            };
        }

        case 'AWS::ApiGateway::Resource': {
            const res = new aws.apigateway.Resource(logicalId, props, options);

            return {
                resource: res,
                attributes: {
                    ...getAttributesFromResource(res),
                    id: res.resourceId,
                },
            };
        }

        case 'AWS::ApiGateway::Deployment': {
            const res = new aws.apigateway.Deployment(logicalId, props, options);

            return {
                attributes: {
                    ...getAttributesFromResource(res),
                    id: res.deploymentId,
                },
                resource: res,
            };
        }

        case 'AWS::ApiGateway::Stage': {
            const res = new aws.apigateway.Stage(logicalId, props, options);

            return {
                attributes: {
                    ...getAttributesFromResource(res),
                    id: res.stageName,
                },
                resource: res,
            };
        }

        case 'AWS::ApiGatewayV2::Authorizer': {
            const res = new aws.apigatewayv2.Authorizer(logicalId, props, options);

            return {
                attributes: {
                    ...getAttributesFromResource(res),
                    id: res.authorizerId,
                },
                resource: res,
            };
        }

        case 'AWS::ApiGateway::Authorizer': {
            const res = new aws.apigateway.Authorizer(logicalId, props, options);

            return {
                attributes: {
                    ...getAttributesFromResource(res),
                    id: res.authorizerId,
                },
                resource: res,
            };
        }

        default: {
            const mName = moduleName(typeName).toLowerCase();
            const pType = pulumiTypeName(typeName);
            const awsModule = aws as any;
            if (!awsModule[mName] || !awsModule[mName][pType]) {
                throw new CdkAdapterError(
                    `Resource type '${typeName}' is not supported by AWS Cloud Control. ` +
                        'To map this resource to an AWS Provider resource, see the documentation ' +
                        'here: https://github.com/pulumi/pulumi-cdk#mapping-aws-resources',
                );
            }

            return new awsModule[mName][pType](logicalId, props, options);
        }
    }
}

export function attributePropertyName(attributeName: string): string {
    return toSdkName(attributeName.split('.')[0]);
}
