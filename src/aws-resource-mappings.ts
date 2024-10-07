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
import * as aws from '@pulumi/aws';
import { ResourceMapping, normalize } from './interop';

function maybe<T, U>(v: T | undefined, fn: (t: T) => U): U | undefined {
    if (v === undefined) {
        return undefined;
    }
    return fn(v);
}

interface CfnTags {
    key: pulumi.Input<string>;
    value: pulumi.Input<string>;
}

type AwsTags = pulumi.Input<{ [key: string]: pulumi.Input<string> }>;

function tags(tags: pulumi.Input<pulumi.Input<CfnTags>[]> | undefined): AwsTags | undefined {
    return maybe(tags, (tags) =>
        pulumi
            .output(tags)
            .apply((tags) => tags.reduce((tags: any, tag: any) => ({ ...tags, [tag.key]: tag.value }), {})),
    );
}

/**
 * Any resource that does not currently exist in CCAPI can be mapped to an aws classic resource.
 */
export function mapToAwsResource(
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
): ResourceMapping | undefined {
    const props = normalize(rawProps);
    switch (typeName) {
        // ApiGatewayV2
        case 'AWS::ApiGatewayV2::Integration':
            return new aws.apigatewayv2.Integration(
                logicalId,
                {
                    ...props,
                    requestParameters: rawProps.RequestParameters,
                    requestTemplates: rawProps.RequestTemplates,
                    responseParameters: rawProps.ResponseParameters,
                    tlsConfig: maybe(props.tlsConfig, () => ({ insecureSkipVerification: true })),
                },
                options,
            );
        case 'AWS::ApiGatewayV2::Stage':
            return new aws.apigatewayv2.Stage(
                logicalId,
                {
                    accessLogSettings: props.accessLogSettings,
                    apiId: props.apiId,
                    autoDeploy: props.autoDeploy,
                    clientCertificateId: props.clientCertificateId,
                    defaultRouteSettings: props.defaultRouteSettings,
                    deploymentId: props.deploymentId,
                    description: props.description,
                    name: props.stageName,
                    routeSettings: props.routeSettings,
                    stageVariables: rawProps.StageVariables,
                    tags: tags(props.tags),
                },
                options,
            );

        // IAM
        case 'AWS::IAM::Policy': {
            const policy = new aws.iam.Policy(
                logicalId,
                {
                    policy: rawProps.PolicyDocument,
                },
                options,
            );

            for (let i = 0; i < (props.groups || []).length; i++) {
                new aws.iam.GroupPolicyAttachment(
                    `${logicalId}-${i}`,
                    {
                        group: props.groups[i],
                        policyArn: policy.arn,
                    },
                    options,
                );
            }
            for (let i = 0; i < (props.roles || []).length; i++) {
                new aws.iam.RolePolicyAttachment(
                    `${logicalId}-${i}`,
                    {
                        role: props.roles[i],
                        policyArn: policy.arn,
                    },
                    options,
                );
            }
            for (let i = 0; i < (props.users || []).length; i++) {
                new aws.iam.UserPolicyAttachment(
                    `${logicalId}-${i}`,
                    {
                        user: props.users[i],
                        policyArn: policy.arn,
                    },
                    options,
                );
            }

            return policy;
        }

        default:
            return undefined;
    }
}
