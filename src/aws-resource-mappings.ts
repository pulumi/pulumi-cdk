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
import { debug } from '@pulumi/pulumi/log';

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
                    tlsConfig: maybe(props.tlsConfig, (_) => ({ insecureSkipVerification: true })),
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
        case 'AWS::EC2::SecurityGroup': {
            debug(`AWS::EC2::SecurityGroup props: ${JSON.stringify(props)}`);
            const securityGroup = new aws.ec2.SecurityGroup(
                logicalId,
                {
                    description: props.groupDescription,
                    egress: (props.securityGroupEgress || []).map((e: any) => {
                        const egress = {
                            description: e.description,
                            protocol: e.ipProtocol,
                            fromPort: e.fromPort,
                            toPort: e.toPort,
                            cidrBlocks: e.cidrIp ? [e.cidrIp] : undefined,
                            ipv6CidrBlocks: e.cidrIpv6 ? [e.cidrIpv6] : undefined,
                            prefixListIds: e.destinationPrefixListId ? [e.destinationPrefixListId] : undefined,
                            securityGroups: e.destinationSecurityGroupId || [],
                        };
                        if (egress.fromPort === undefined && egress.toPort === undefined && egress.protocol == "-1") {
                            egress.fromPort = 0;
                            egress.toPort = 0;
                        }
                        return egress;
                    }),
                    ingress: (props.securityGroupIngress || []).map((i: any) => {
                        return {
                            description: i.description,
                            protocol: i.ipProtocol,
                            fromPort: i.fromPort,
                            toPort: i.toPort,
                            cidrBlocks: i.cidrIp ? [i.cidrIp] : undefined,
                            ipv6CidrBlocks: i.cidrIpv6 ? [i.cidrIpv6] : undefined,
                            prefixListIds: i.destinationPrefixListId ? [i.destinationPrefixListId] : undefined,
                            securityGroups: (i.sourceSecurityGroupId || []).concat(...i.sourceSecurityGroupName || []),
                        };
                    }),
                    tags: tags(props.tags),
                    vpcId: props.vpcId,
                    revokeRulesOnDelete: true, // FIXME: is this right?
                },
                options,
            );
            return {
                resource: securityGroup,
                attributes: { "groupId": securityGroup.id },
            };
        }
        case 'AWS::EC2::SecurityGroupEgress':
            debug(`AWS::EC2::SecurityGroupEgress props: ${JSON.stringify(props)}`);
            return new aws.ec2.SecurityGroupRule(logicalId,
                {
                    protocol: props.ipProtocol,
                    fromPort: props.fromPort,
                    toPort: props.toPort,
                    sourceSecurityGroupId: props.destinationSecurityGroupId,
                    securityGroupId: props.groupId,
                    prefixListIds: props.destinationPrefixListId,
                    cidrBlocks: props.cidrIp ? [props.cidrIp] : undefined,
                    ipv6CidrBlocks: props.cidrIpv6 ? [props.cidrIpv6] : undefined,
                    type: "egress",
                },
                options,
            );
        case 'AWS::EC2::SecurityGroupIngress':
            debug(`AWS::EC2::SecurityGroupIngress props: ${JSON.stringify(props)}: cidr_blocks: ${props.cidrIp}`);
            return new aws.ec2.SecurityGroupRule(logicalId,
                {
                    protocol: props.ipProtocol,
                    fromPort: props.fromPort,
                    toPort: props.toPort,
                    securityGroupId: props.groupId,
                    prefixListIds: props.sourcePrefixListId,
                    sourceSecurityGroupId: props.sourceSecurityGroupId,
                    cidrBlocks: props.cidrIp ? [props.cidrIp] : undefined,
                    ipv6CidrBlocks: props.cidrIpv6 ? [props.cidrIpv6] : undefined,
                    type: "ingress",
                },
                options,
            );
        case 'AWS::EC2::VPCGatewayAttachment':
            // Create either an internet gateway attachment or a VPC gateway attachment
            // depending on the payload. 
            if (props.vpnGatewayId === undefined) {
                return new aws.ec2.InternetGatewayAttachment(logicalId,
                    {
                        internetGatewayId: props.internetGatewayId,
                        vpcId: props.vpcId,
                    },
                    options,
                );
            }
            return new aws.ec2.VpnGatewayAttachment(logicalId, {
                vpcId: props.vpcId,
                vpnGatewayId: props.vpnGatewayId,
            },
                options,
            );
        case 'AWS::ElasticLoadBalancingV2::LoadBalancer': {
            debug(`AWS::ElasticLoadBalancingV2::LoadBalancer props: ${JSON.stringify(props)}`)
            const lb = new aws.lb.LoadBalancer(logicalId,
                {
                    ipAddressType: props.ipAddressType,
                    loadBalancerType: props.type,
                    securityGroups: props.securityGroups,
                    subnets: props.subnets,
                    subnetMappings: props.subnetMappings?.map((m: any) => <aws.types.input.lb.LoadBalancerSubnetMapping>{
                        allocationId: m.allocationId,
                        ipv6Address: m.iPv6Address,
                        privateIpv4Address: m.privateIPv4Address,
                        subnetId: m.subnetId,
                    }),
                    tags: tags(props.tags),
                    internal: props.scheme ? props.scheme == "internal" : false,
                },
                options,
            );
            return {
                resource: lb,
                attributes: { "dNSName": lb.dnsName, }
            };
        }
        case 'AWS::ElasticLoadBalancingV2::TargetGroup': {
            debug(`AWS::ElasticLoadBalancingV2::TargetGroup props: ${JSON.stringify(props)}`);
            const tgAttributes = targetGroupAttributesMap(props.targetGroupAttributes);
            debug(`${logicalId} tgAttributes ${JSON.stringify(tgAttributes)}`)
            const tg = new aws.lb.TargetGroup(logicalId,
                {
                    healthCheck: {
                        enabled: props.healthCheckEnabled,
                        interval: props.healthCheckIntervalSeconds,
                        path: props.healthCheckPath,
                        port: props.healthCheckPort,
                        protocol: props.healthCheckProtocol,
                        timeout: props.healthCheckTimeoutSeconds,
                        matcher: props.matcher ? (props.matcher.httpCode || props.matcher.grpcCode) : undefined,
                        healthyThreshold: props.healthyThresholdCount,
                    },
                    // logicalId can be too big and cause autonaming to spill beyond 32 char limit for names
                    name: props.name ?? (logicalId.length > 24 ? logicalId.slice(-32) : undefined),
                    port: props.port,
                    protocol: props.protocol,
                    protocolVersion: props.protocolVersion,
                    vpcId: props.vpcId,
                    tags: tags(props.tags),
                    targetType: props.targetType,
                    stickiness: stickiness(tgAttributes),
                    deregistrationDelay: maybeTargetGroupAttribute(tgAttributes, "deregistration_delay.timeout_seconds"),
                    connectionTermination: maybeTargetGroupAttribute(tgAttributes, "deregistration_delay.connection_termination.enabled"),
                    proxyProtocolV2: maybeTargetGroupAttribute(tgAttributes, "proxy_protocol_v2.enabled"),
                    preserveClientIp: maybeTargetGroupAttribute(tgAttributes, "preserve_client_ip.enabled"),
                    lambdaMultiValueHeadersEnabled: maybeTargetGroupAttribute(tgAttributes, "lambda.multi_value_headers.enabled"),
                    slowStart: maybeTargetGroupAttribute(tgAttributes, "slow_start.duration_seconds"),
                    loadBalancingAlgorithmType: maybeTargetGroupAttribute(tgAttributes, "load_balancing.algorithm.type"),
                },
                options,
            );
            return {
                resource: tg,
                attributes: {
                    "targetGroupFullName": tg.arnSuffix,
                    "targetGroupName": tg.name,
                },
            };
        }
        case 'AWS::AutoScaling::AutoScalingGroup': {
            debug(`AWS::AutoScaling::AutoScalingGroup props: ${JSON.stringify(props)}`);
            return new aws.autoscaling.Group(logicalId,
                {
                    availabilityZones: props.availabilityZones,
                    maxSize: parseInt(props.maxSize),
                    minSize: parseInt(props.minSize),
                    capacityRebalance: props.capacityRebalance ? JSON.parse(props.capacityRebalance) : undefined,
                    defaultCooldown: props.cooldown ? parseInt(props.cooldown) : undefined,
                    desiredCapacity: props.desiredCapacity ? parseInt(props.desiredCapacity) : undefined,
                    healthCheckGracePeriod: props.healthCheckGracePeriod ? parseInt(props.healthCheckGracePeriod) : undefined,
                    healthCheckType: props.healthCheckType,
                    launchConfiguration: props.launchConfigurationName,
                    launchTemplate: props.launchTemplate?.map(
                        (t: any) => <aws.types.input.autoscaling.GroupLaunchTemplate>{
                            id: t.launchTemplateId,
                            name: t.launchTemplateName,
                            version: t.version,
                        }),
                    initialLifecycleHooks: props.lifecycleHookSpecificationList?.map((s: any) => <aws.types.input.autoscaling.GroupInitialLifecycleHook>{
                        defaultResult: s.defaultReason,
                        heartbeatTimeout: s.heartbeatTimeout,
                        lifecycleTransition: s.lifecycleTransition,
                        notificationMetadata: s.notificationMetadata,
                        notificationTargetArn: s.notificationTargetArn,
                        roleArn: s.roleArn,
                        name: s.lifeCycleHookName,
                    }),
                    loadBalancers: props.loadBalancerNames,
                    maxInstanceLifetime: props.maxInstanceLifetime,
                    // mixedInstancesPolicy: FIXME!
                    protectFromScaleIn: props.newInstancesProtectedFromScaleIn,
                    placementGroup: props.placementGroup,
                    serviceLinkedRoleArn: props.serviceLinkedRoleArn,
                    tags: props.tags?.map((
                        (m: { key: any; propagateAtLaunch: any; value: any; }) => <aws.types.input.autoscaling.GroupTag>{
                            key: m.key,
                            propagateAtLaunch: m.propagateAtLaunch,
                            value: m.value
                        })),
                    targetGroupArns: props.targetGroupARNs,
                    terminationPolicies: props.terminationPolicies,
                    vpcZoneIdentifiers: props.vPCZoneIdentifier,
                },
                options,
            );
        }
        case 'AWS::AutoScaling::ScalingPolicy': {
            return new aws.autoscaling.Policy(logicalId,
                {
                    adjustmentType: props.adjustmentType,
                    autoscalingGroupName: props.autoScalingGroupName,
                    cooldown: props.cooldown ? parseInt(props.cooldown) : undefined,
                    estimatedInstanceWarmup: props.estimatedInstanceWarmup ? parseInt(props.estimatedInstanceWarmup) : undefined,
                    metricAggregationType: props.metricAggregationType,
                    minAdjustmentMagnitude: props.minAdjustmentMagnitude,
                    policyType: props.policyType,
                    predictiveScalingConfiguration: props.predictiveScalingConfiguration,
                    scalingAdjustment: props.scalingAdjustment,
                    stepAdjustments: props.stepAdjustments,
                    targetTrackingConfiguration: props.targetTrackingConfiguration,
                },
                options,
            );
        }
        case 'AWS::EC2::Route':
            return new aws.ec2.Route(logicalId,
                {
                    routeTableId: props.routeTableId,
                    carrierGatewayId: props.carrierGatewayId,
                    destinationCidrBlock: props.destinationCidrBlock,
                    destinationIpv6CidrBlock: props.destinationIpv6CidrBlock,
                    egressOnlyGatewayId: props.egressOnlyInternetGatewayId,
                    gatewayId: props.gatewayId,
                    instanceId: props.instanceId,
                    localGatewayId: props.localGatewayId,
                    natGatewayId: props.natGatewayId,
                    networkInterfaceId: props.networkInterfaceId,
                    transitGatewayId: props.transitGatewayId,
                    vpcEndpointId: props.vpcEndpointId,
                    vpcPeeringConnectionId: props.vpcPeeringConnectionId,
                },
                options,
            );
        case 'AWS::EC2::NatGateway':
            return new aws.ec2.NatGateway(logicalId,
                {
                    subnetId: props.subnetId,
                    allocationId: props.allocationId,
                    connectivityType: props.connectivityType,
                    tags: tags(props.tags)
                },
                options,
            );
        case 'AWS::ApplicationAutoScaling::ScalableTarget': {
            const target = new aws.appautoscaling.Target(logicalId, {
                maxCapacity: props.maxCapacity,
                minCapacity: props.minCapacity,
                resourceId: props.resourceId,
                roleArn: props.roleArn,
                scalableDimension: props.scalableDimension,
                serviceNamespace: props.serviceNamespace,
            }, options);
            props.ScheduledActions?.map(
                (action: any) => new aws.appautoscaling.ScheduledAction(
                    logicalId + action.scheduledActionName,
                    {
                        resourceId: target.resourceId,
                        scalableDimension: target.scalableDimension,
                        scalableTargetAction: action.scalableTargetAction,
                        schedule: action.schedule,
                        serviceNamespace: target.serviceNamespace,
                        startTime: action.startTime,
                        endTime: action.endTime,
                        timezone: action.timezone,
                        name: action.scheduledActionName,
                    },
                    options,
                ),
            );
            return target;
        }
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

function stickiness(targetGroupAttributes: any): pulumi.Input<aws.types.input.lb.TargetGroupStickiness> | undefined {
    if (targetGroupAttributes === undefined) {
        return undefined;
    }

    const enabled = targetGroupAttributes["stickiness.enabled"] ? JSON.parse(targetGroupAttributes["stickiness.enabled"]) : false;
    if (!enabled) {
        return undefined;
    }

    let cookieDuration = undefined
    if ("stickiness.app_cookie.duration_seconds" in targetGroupAttributes) {
        cookieDuration = targetGroupAttributes["stickiness.app_cookie.duration_seconds"]
    } else if ("stickiness.lb_cookie.duration_seconds" in targetGroupAttributes) {
        cookieDuration = targetGroupAttributes["stickiness.lb_cookie.duration_seconds"]
    }
    return {
        enabled: enabled,
        type: maybeTargetGroupAttribute(targetGroupAttributes, "stickiness.type"),
        cookieName: maybeTargetGroupAttribute(targetGroupAttributes, "stickiness.app_cookie.cookie_name"),
        cookieDuration: cookieDuration,
    }
}

function maybeTargetGroupAttribute(targetGroupAttributes: any, key: string): any {
    if (targetGroupAttributes === undefined) {
        return undefined;
    }

    let val = undefined
    if (key in targetGroupAttributes) {
        val = targetGroupAttributes[key]
    }
    return val
}

function targetGroupAttributesMap(targetGroupAttributes: any) {
    if (targetGroupAttributes === undefined) {
        return undefined;
    }

    const attrsMap: { [name: string]: any } = {};
    const attrs = targetGroupAttributes as Array<any>;
    for (const attr of attrs) {
        attrsMap[attr.key] = attr.value;
    }
    return attrsMap

}
