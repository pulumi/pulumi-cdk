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
import { CfnElement } from 'aws-cdk-lib';

export function mapToAwsResource(
    element: CfnElement,
    logicalId: string,
    typeName: string,
    rawProps: any,
    props: any,
    options: pulumi.ResourceOptions,
): { [logicalId: string]: pulumi.Resource } | undefined {
    switch (typeName) {
        // EC2
        case 'AWS::EC2::EIP':
            return {
                [logicalId]: new aws.ec2.Eip(
                    logicalId,
                    {
                        instance: props.instanceId,
                        publicIpv4Pool: props.publicIpv4Pool,
                        tags: props.tags
                            ? props.tags.reduce((tags: any, tag: any) => ({ ...tags, [tag.key]: tag.value }), {})
                            : undefined,
                        vpc: props.domain ? pulumi.output(props.domain).apply((domain) => domain === 'vpc') : undefined,
                    },
                    options,
                ),
            };

        // IAM
        case 'AWS::IAM::Policy': {
            const policy = new aws.iam.Policy(
                logicalId,
                {
                    name: rawProps.PolicyName,
                    policy: rawProps.PolicyDocument,
                },
                options,
            );

            for (const group of props.groups || []) {
                const attachment = new aws.iam.GroupPolicyAttachment(
                    `${logicalId}-${group}`,
                    {
                        group: group,
                        policyArn: policy.arn,
                    },
                    options,
                );
            }
            for (const role of props.roles || []) {
                const attachment = new aws.iam.RolePolicyAttachment(
                    `${logicalId}-${role}`,
                    {
                        role: role,
                        policyArn: policy.arn,
                    },
                    options,
                );
            }
            for (const user of props.users || []) {
                const attachment = new aws.iam.UserPolicyAttachment(
                    `${logicalId}-${user}`,
                    {
                        user: user,
                        policyArn: policy.arn,
                    },
                    options,
                );
            }

            return { [logicalId]: policy };
        }

        // Lambda
        case 'AWS::Lambda::Permission':
            // TODO: throw on the presence of functionUrlAuthType / principalOrgId?
            return {
                [logicalId]: new aws.lambda.Permission(
                    logicalId,
                    {
                        action: props.action,
                        eventSourceToken: props.eventSourceToken,
                        function: props.functionName,
                        principal: props.principal,
                        sourceAccount: props.sourceAccount,
                        sourceArn: props.sourceArn,
                        statementId: logicalId,
                    },
                    options,
                ),
            };

        // S3
        case 'AWS::S3::BucketPolicy':
            return {
                [logicalId]: new aws.s3.BucketPolicy(
                    logicalId,
                    {
                        bucket: rawProps.Bucket,
                        policy: rawProps.PolicyDocument,
                    },
                    options,
                ),
            };
        default:
            return undefined;
    }
}
