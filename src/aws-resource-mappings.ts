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

export function mapToAwsResource(
    element: CfnElement,
    logicalId: string,
    typeName: string,
    rawProps: any,
    options: pulumi.ResourceOptions,
): ResourceMapping | undefined {
    const props = normalize(rawProps);
    switch (typeName) {
        // ApiGatewayV2
        case 'AWS::ApiGatewayV2::Api':
            return new aws.apigatewayv2.Api(logicalId, props, options);
        case 'AWS::ApiGatewayV2::Deployment':
            return new aws.apigatewayv2.Deployment(logicalId, props, options);
        case 'AWS::ApiGatewayV2::Integration':
            return new aws.apigatewayv2.Integration(
                logicalId,
                {
                    ...props,
                    requestParameters: rawProps.RequestParameters,
                    requestTemplates: rawProps.RequestTemplates,
                    responseParameters: rawProps.ResponseParameters,
                    tlsConfig: maybe(props.tlsConfig, (tls) => ({ insecureSkipVerification: true })),
                },
                options,
            );
        case 'AWS::ApiGatewayV2::Route':
            return new aws.apigatewayv2.Route(
                logicalId,
                {
                    ...props,
                    requestModels: rawProps.RequestModels,
                    requestParameters: rawProps.RequestParameters,
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

        // DynamoDB
        case 'AWS::DynamoDB::Table':
            return mapDynamoDBTable(element, logicalId, typeName, rawProps, props, options);

        // EC2
        case 'AWS::EC2::EIP':
            return new aws.ec2.Eip(
                logicalId,
                {
                    instance: props.instanceId,
                    publicIpv4Pool: props.publicIpv4Pool,
                    tags: tags(props.tags),
                    vpc: props.domain ? pulumi.output(props.domain).apply((domain) => domain === 'vpc') : undefined,
                },
                options,
            );

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

            for (let i = 0; i < (props.groups || []).length; i++) {
                const attachment = new aws.iam.GroupPolicyAttachment(
                    `${logicalId}-${i}`,
                    {
                        group: props.groups[i],
                        policyArn: policy.arn,
                    },
                    options,
                );
            }
            for (let i = 0; i < (props.roles || []).length; i++) {
                const attachment = new aws.iam.RolePolicyAttachment(
                    `${logicalId}-${i}`,
                    {
                        role: props.roles[i],
                        policyArn: policy.arn,
                    },
                    options,
                );
            }
            for (let i = 0; i < (props.users || []).length; i++) {
                const attachment = new aws.iam.UserPolicyAttachment(
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

        // Lambda
        case 'AWS::Lambda::Permission':
            // TODO: throw on the presence of functionUrlAuthType / principalOrgId?
            return new aws.lambda.Permission(
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
            );

        // S3
        case 'AWS::S3::BucketPolicy':
            return new aws.s3.BucketPolicy(
                logicalId,
                {
                    bucket: rawProps.Bucket,
                    policy: rawProps.PolicyDocument,
                },
                options,
            );

        default:
            return undefined;
    }
}

function mapDynamoDBTable(
    element: CfnElement,
    logicalId: string,
    typeName: string,
    rawProps: any,
    props: any,
    options: pulumi.ResourceOptions,
): aws.dynamodb.Table {
    function hashKey(schema: any): string | undefined {
        return schema.find((k: any) => k.keyType === 'HASH')?.attributeName;
    }

    function rangeKey(schema: any): string | undefined {
        return schema.find((k: any) => k.keyType === 'RANGE')?.attributeName;
    }

    const attributes = props.attributeDefinitions?.map((attr: any) => ({
        name: attr.attributeName,
        type: attr.attributeType,
    }));

    const globalSecondaryIndexes = props.globalSecondaryIndexes?.map((index: any) => ({
        hashKey: hashKey(index.keySchema),
        name: index.indexName,
        nonKeyAttributes: props.projection.nonKeyAttributes,
        projectionType: props.projection.projectionType,
        rangeKey: rangeKey(index.keySchema),
        readCapacity: props.provisionedThroughput?.readCapacityUnits,
        writeCapacity: props.provisionedThroughput?.writeCapacityUnits,
    }));

    const localSecondaryIndexes = props.localSecondaryIndexes?.map((index: any) => ({
        name: index.indexName,
        nonKeyAttributes: index.projection.nonKeyAttributes,
        projectionType: index.projection.projectionType,
        rangeKey: rangeKey(index.keySchema),
    }));

    const pointInTimeRecovery = maybe(props.pointInTimeRecoverySpecification, (spec) => ({
        enabled: spec.pointInTimeRecoveryEnabled,
    }));

    const serverSideEncryption = maybe(props.sSESpecification, (spec) => ({
        enabled: spec.sSEEnabled,
        kmsKeyArn: spec.kMSMasterKeyId,
    }));

    return new aws.dynamodb.Table(
        logicalId,
        {
            attributes: attributes,
            billingMode: props.billingMode,
            globalSecondaryIndexes: globalSecondaryIndexes,
            hashKey: hashKey(props.keySchema),
            localSecondaryIndexes: localSecondaryIndexes,
            name: props.tableName,
            pointInTimeRecovery: pointInTimeRecovery,
            rangeKey: rangeKey(props.keySchema),
            readCapacity: props.provisionedThroughput?.readCapacityUnits,
            serverSideEncryption: serverSideEncryption,
            streamEnabled: props.streamSpecification !== undefined,
            streamViewType: props.streamSpecification?.streamViewType,
            tableClass: props.tableClass,
            tags: tags(props.tags),
            ttl: props.timeToLiveSpecification,
            writeCapacity: props.provisionedThroughput?.writeCapacityUnits,
        },
        options,
    );
}
