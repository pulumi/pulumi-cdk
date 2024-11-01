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
import { ResourceAttributeMappingArray, ResourceMapping, normalize } from './interop';

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

        // SQS
        // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-sqs-queuepolicy.html
        case 'AWS::SQS::QueuePolicy': {
            if (!Array.isArray(props.queues)) {
                throw new Error('QueuePolicy has an invalid value for `queues` property');
            }

            const queues: string[] = props.queues ?? [];
            return queues.flatMap((q: string, i: number) => {
                const id = i === 0 ? logicalId : `${logicalId}-policy-${i}`;
                return {
                    logicalId: id,
                    resource: new aws.sqs.QueuePolicy(id, {
                        policy: rawProps.PolicyDocument,
                        queueUrl: q,
                    }),
                };
            });
        }

        // SNS
        // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-sns-topicpolicy.html
        case 'AWS::SNS::TopicPolicy': {
            if (!Array.isArray(props.topics)) {
                throw new Error('TopicPolicy has an invalid value for `topics` property');
            }

            const topics: string[] = props.topics ?? [];
            return topics.flatMap((arn: string, i: number) => {
                const id = i === 0 ? logicalId : `${logicalId}-policy-${i}`;
                return {
                    logicalId: id,
                    resource: new aws.sns.TopicPolicy(id, {
                        policy: rawProps.PolicyDocument,
                        arn,
                    }),
                };
            });
        }

        // IAM
        case 'AWS::IAM::Policy': {
            const resources: ResourceAttributeMappingArray = [];
            const policy = new aws.iam.Policy(
                logicalId,
                {
                    policy: rawProps.PolicyDocument,
                },
                options,
            );
            resources.push({
                resource: policy,
                logicalId,
            });

            const groups: string[] = props.groups ?? [];
            resources.push(
                ...groups.flatMap((group: string, i: number) => {
                    const id = `${logicalId}-group-${i}`;
                    return {
                        logicalId: id,
                        resource: new aws.iam.GroupPolicyAttachment(
                            id,
                            {
                                group,
                                policyArn: policy.arn,
                            },
                            options,
                        ),
                    };
                }),
            );

            const roles: string[] = props.roles ?? [];
            resources.push(
                ...roles.flatMap((role: string, i: number) => {
                    const id = `${logicalId}-role-${i}`;
                    return {
                        logicalId: id,
                        resource: new aws.iam.RolePolicyAttachment(
                            id,
                            {
                                role,
                                policyArn: policy.arn,
                            },
                            options,
                        ),
                    };
                }),
            );

            const users: string[] = props.users ?? [];
            resources.push(
                ...users.flatMap((user: string, i: number) => {
                    const id = `${logicalId}-user-${i}`;
                    return {
                        logicalId: id,
                        resource: new aws.iam.UserPolicyAttachment(
                            id,
                            {
                                user,
                                policyArn: policy.arn,
                            },
                            options,
                        ),
                    };
                }),
            );

            return resources;
        }

        default:
            return undefined;
    }
}
