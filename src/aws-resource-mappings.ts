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
        case 'AWS::ApiGatewayV2::Integration': {
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
        }
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
                    resource: new aws.sqs.QueuePolicy(
                        id,
                        {
                            policy: rawProps.PolicyDocument,
                            queueUrl: q,
                        },
                        options,
                    ),
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
                    resource: new aws.sns.TopicPolicy(
                        id,
                        {
                            policy: rawProps.PolicyDocument,
                            arn,
                        },
                        options,
                    ),
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

        case 'AWS::Route53::RecordSet': {
            let records: string[] = props.resourceRecords;
            if (props.type === 'TXT') {
                // CDK has special handling for TXT records that conflicts with the Terraform provider's handling.
                // 1. CDK wraps the value in double quotes, which Terraform does as well. We need to remove the quotes that
                //    CDK adds otherwise we get double quotes
                // 2. CDK splits the value into multiple records if it exceeds 255 characters. Terraform does not do this so we need to.
                //
                //           (user)                 (cdk)                (terraform)
                //    e.g. "hello...hello" => '"hello...""hello"'    ["hello...", "hello"]
                records = records.flatMap((r) => r.split('""').flatMap((record) => record.replace(/"/g, '')));
            }
            return new aws.route53.Record(
                logicalId,
                {
                    zoneId: props.hostedZoneId,
                    name: props.name,
                    type: props.type,
                    records,
                    ttl: props.ttl,
                    aliases: props.aliasTarget
                        ? [
                              {
                                  name: props.aliasTarget.dnsName,
                                  zoneId: props.aliasTarget.hostedZoneId,
                                  evaluateTargetHealth: props.aliasTarget.evaluateTargetHealth ?? false,
                              },
                          ]
                        : undefined,
                    healthCheckId: props.healthCheckId,
                    setIdentifier: props.setIdentifier,
                    cidrRoutingPolicy: props.cidrRoutingConfig,
                    failoverRoutingPolicies: props.failover ? [{ type: props.failover }] : undefined,
                    weightedRoutingPolicies: props.weight ? [{ weight: props.weight }] : undefined,
                    geoproximityRoutingPolicy: props.geoProximityLocation
                        ? {
                              bias: props.geoProximityLocation.bias,
                              awsRegion: props.geoProximityLocation.awsRegion,
                              localZoneGroup: props.geoProximityLocation.localZoneGroup,
                              coordinates: props.geoProximityLocation.coordinates
                                  ? [props.geoProximityLocation.coordinates]
                                  : undefined,
                          }
                        : undefined,
                    geolocationRoutingPolicies: props.geoLocation
                        ? [
                              {
                                  country: props.geoLocation.countryCode,
                                  continent: props.geoLocation.continentCode,
                                  subdivision: props.geoLocation.subdivisionCode,
                              },
                          ]
                        : undefined,
                    multivalueAnswerRoutingPolicy: props.multiValueAnswer,
                },
                options,
            );
        }

        case 'AWS::Events::EventBusPolicy': {
            let props: aws.cloudwatch.EventBusPolicyArgs;
            if (rawProps.Statement && (rawProps.Principal || rawProps.Action || rawProps.Condition)) {
                throw new Error(
                    'EventBusPolicy args invalid. Only Statement or StatementId, Principal, Action, and Condition are allowed',
                );
            } else if (rawProps.Statement) {
                props = {
                    policy: pulumi.jsonStringify({
                        Statement: [rawProps.Statement],
                        Version: '2012-10-17',
                    }),
                    eventBusName: rawProps.EventBusName,
                };
            } else {
                const region = aws.getRegionOutput({}, options).name;
                const partition = aws.getPartitionOutput({}, options).partition;
                const busName = rawProps.EventBusName ?? 'default';
                const arn = pulumi.interpolate`arn:${partition}:events:${region}:${rawProps.Principal}:event-bus/${busName}`;
                props = {
                    policy: pulumi.jsonStringify({
                        Statement: [
                            {
                                Sid: rawProps.StatementId,
                                Principal: {
                                    AWS: rawProps.Principal,
                                },
                                Action: rawProps.Action,
                                Effect: 'Allow',
                                Resource: arn,
                                Condition: rawProps.Condition,
                            },
                        ],
                        Version: '2012-10-17',
                    }),
                    eventBusName: rawProps.EventBusName,
                };
            }
            return new aws.cloudwatch.EventBusPolicy(logicalId, props, options);
        }
        default:
            return undefined;
    }
}
