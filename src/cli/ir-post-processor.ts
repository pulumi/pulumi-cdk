import {
    ProgramIR,
    ResourceIR,
    ResourceIROptions,
    StackIR,
    StackAddress,
    PropertyMap,
    PropertyValue,
    ResourceAttributeReference,
} from '@pulumi/cdk-convert-core';
import { ConversionReportCollector } from './conversion-report';

export interface PostProcessOptions {
    skipCustomResources?: boolean;
    reportCollector?: ConversionReportCollector;
}

interface BootstrapBucketRef {
    stackPath: string;
    logicalId: string;
    resource: ResourceIR;
}

export function postProcessProgramIr(program: ProgramIR, options: PostProcessOptions = {}): ProgramIR {
    const bootstrapBucket = options.skipCustomResources ? undefined : findBootstrapBucket(program);
    return {
        ...program,
        stacks: program.stacks.map((stack) => {
            options.reportCollector?.stackStarted(stack);
            const resources = rewriteResources(stack, bootstrapBucket, options);
            options.reportCollector?.stackFinished(stack, resources.length);
            return {
                ...stack,
                resources,
            };
        }),
    };
}

function rewriteResources(
    stack: StackIR,
    bootstrapBucket: BootstrapBucketRef | undefined,
    options: PostProcessOptions = {},
): ResourceIR[] {
    const collector = options.reportCollector;
    const rewritten: ResourceIR[] = [];
    for (const resource of stack.resources) {
        if (resource.cfnType === 'AWS::CDK::Metadata') {
            collector?.resourceSkipped(stack, resource, 'cdkMetadata');
            continue;
        }

        if (resource.cfnType === 'AWS::ApiGatewayV2::Stage') {
            const converted = convertApiGatewayV2Stage(resource);
            recordConversionArtifacts(collector, stack, resource, [converted]);
            rewritten.push(converted);
            continue;
        }

        if (resource.cfnType === 'AWS::ServiceDiscovery::Service') {
            const converted = convertServiceDiscoveryService(resource);
            recordConversionArtifacts(collector, stack, resource, [converted]);
            rewritten.push(converted);
            continue;
        }

        if (resource.cfnType === 'AWS::ServiceDiscovery::PrivateDnsNamespace') {
            const converted = convertServiceDiscoveryPrivateDnsNamespace(resource);
            recordConversionArtifacts(collector, stack, resource, [converted]);
            rewritten.push(converted);
            continue;
        }

        if (resource.cfnType === 'AWS::IAM::Policy') {
            const converted = convertIamPolicy(resource, stack.stackPath);
            recordConversionArtifacts(collector, stack, resource, converted);
            rewritten.push(...converted);
            continue;
        }

        if (isCustomResource(resource)) {
            if (options.skipCustomResources) {
                collector?.resourceSkipped(stack, resource, 'customResourceFiltered');
                continue;
            }
            if (!bootstrapBucket) {
                throw new Error(
                    `Unable to locate the CDK staging bucket required to emulate custom resource ${resource.logicalId}.`,
                );
            }
            rewritten.push(convertCustomResource(resource, stack, bootstrapBucket));
            continue;
        }

        rewritten.push(resource);
    }

    return rewritten;
}

function recordConversionArtifacts(
    collector: ConversionReportCollector | undefined,
    stack: StackIR,
    source: ResourceIR,
    produced: ResourceIR[],
) {
    if (!collector) {
        return;
    }
    const classicTargets = Array.from(
        new Set(produced.filter((result) => result.typeToken.startsWith('aws:')).map((result) => result.typeToken)),
    );
    if (classicTargets.length > 0) {
        collector.classicConversion(stack, source, classicTargets);
    }
    if (produced.length > 1) {
        collector.fanOut(stack, source, produced);
    }
}

function convertApiGatewayV2Stage(resource: ResourceIR): ResourceIR {
    const props = resource.cfnProperties;
    const stageProps = removeUndefined({
        accessLogSettings: props.AccessLogSettings,
        apiId: props.ApiId,
        autoDeploy: props.AutoDeploy,
        clientCertificateId: props.ClientCertificateId,
        defaultRouteSettings: props.DefaultRouteSettings,
        deploymentId: props.DeploymentId,
        description: props.Description,
        name: props.StageName,
        routeSettings: props.RouteSettings,
        stageVariables: props.StageVariables,
        tags: convertTags(props.Tags),
    });

    return {
        ...resource,
        typeToken: 'aws:apigatewayv2/stage:Stage',
        props: stageProps,
    };
}

function convertServiceDiscoveryService(resource: ResourceIR): ResourceIR {
    const props = resource.cfnProperties;
    const serviceProps = removeUndefined({
        description: props.Description,
        dnsConfig: convertServiceDiscoveryDnsConfig(props.DnsConfig),
        healthCheckConfig: convertServiceDiscoveryHealthCheckConfig(props.HealthCheckConfig),
        healthCheckCustomConfig: convertServiceDiscoveryHealthCheckCustomConfig(props.HealthCheckCustomConfig),
        name: props.Name,
        namespaceId: props.NamespaceId,
        tags: convertTags(props.Tags),
        type: props.Type,
    });

    return {
        ...resource,
        typeToken: 'aws:servicediscovery/service:Service',
        props: serviceProps,
    };
}

function convertServiceDiscoveryPrivateDnsNamespace(resource: ResourceIR): ResourceIR {
    const props = resource.cfnProperties;
    const namespaceProps = removeUndefined({
        description: props.Description,
        name: props.Name,
        tags: convertTags(props.Tags),
        vpc: props.Vpc,
    });

    return {
        ...resource,
        typeToken: 'aws:servicediscovery/privateDnsNamespace:PrivateDnsNamespace',
        props: namespaceProps,
    };
}

function convertIamPolicy(resource: ResourceIR, stackPath: string): ResourceIR[] {
    const props = resource.cfnProperties;
    const base: ResourceIR = {
        ...resource,
        typeToken: 'aws:iam/policy:Policy',
        props: buildIamPolicyProps(props),
    };

    const attachments: ResourceIR[] = [];
    const address: StackAddress = { stackPath, id: resource.logicalId };
    const arnReference: ResourceAttributeReference = {
        kind: 'resourceAttribute',
        resource: address,
        attributeName: 'Arn',
        propertyName: 'arn',
    };

    attachments.push(
        ...createAttachmentResources(
            props.Groups,
            'group',
            resource,
            stackPath,
            arnReference,
            'aws:iam/groupPolicyAttachment:GroupPolicyAttachment',
        ),
    );
    attachments.push(
        ...createAttachmentResources(
            props.Roles,
            'role',
            resource,
            stackPath,
            arnReference,
            'aws:iam/rolePolicyAttachment:RolePolicyAttachment',
        ),
    );
    attachments.push(
        ...createAttachmentResources(
            props.Users,
            'user',
            resource,
            stackPath,
            arnReference,
            'aws:iam/userPolicyAttachment:UserPolicyAttachment',
        ),
    );

    return [base, ...attachments];
}

function createAttachmentResources(
    values: PropertyValue | undefined,
    suffix: string,
    source: ResourceIR,
    stackPath: string,
    policyArn: ResourceAttributeReference,
    typeToken: string,
): ResourceIR[] {
    if (!Array.isArray(values) || values.length === 0) {
        return [];
    }
    const deps = buildAttachmentOptions(source.options, stackPath, source.logicalId);
    return values.map((value, index) => ({
        logicalId: `${source.logicalId}-${suffix}-${index}`,
        cfnType: `${source.cfnType}::Attachment`,
        cfnProperties: {},
        typeToken,
        props: buildAttachmentProps(suffix, value, policyArn),
        options: deps,
    }));
}

function buildAttachmentProps(
    suffix: string,
    target: PropertyValue,
    policyArn: ResourceAttributeReference,
): PropertyMap {
    switch (suffix) {
        case 'group':
            return { group: target, policyArn };
        case 'role':
            return { role: target, policyArn };
        case 'user':
            return { user: target, policyArn };
        default:
            return { policyArn };
    }
}

function buildAttachmentOptions(options: ResourceIROptions | undefined, stackPath: string, logicalId: string) {
    const dependsOn = new Map<string, StackAddress>();
    for (const dep of options?.dependsOn ?? []) {
        dependsOn.set(`${dep.stackPath}::${dep.id}`, dep);
    }
    dependsOn.set(`${stackPath}::${logicalId}`, { stackPath, id: logicalId });
    const merged: ResourceIROptions = {
        ...options,
        dependsOn: Array.from(dependsOn.values()),
    };
    return merged;
}

function convertCustomResource(resource: ResourceIR, stack: StackIR, bucket: BootstrapBucketRef): ResourceIR {
    const bucketName = resolveBootstrapBucketName(bucket);
    const bucketAddress: StackAddress = { stackPath: bucket.stackPath, id: bucket.logicalId };
    const bucketNameValue =
        bucketName ??
        ({
            kind: 'resourceAttribute',
            resource: bucketAddress,
            attributeName: 'Ref',
            propertyName: 'bucketName',
        } satisfies ResourceAttributeReference);

    const bucketKeyPrefix = `deploy-time/pulumi/custom-resources/${stack.stackId}/${resource.logicalId}`;

    return {
        ...resource,
        typeToken: 'aws-native:cloudformation:CustomResourceEmulator',
        props: {
            bucketName: bucketNameValue,
            bucketKeyPrefix,
            serviceToken: resource.cfnProperties.ServiceToken,
            resourceType: resource.cfnType,
            customResourceProperties: resource.cfnProperties,
            stackId: stack.stackId,
        },
    };
}

function resolveBootstrapBucketName(bucket: BootstrapBucketRef): PropertyValue | undefined {
    const bucketProps = bucket.resource.props;
    if (bucketProps && typeof bucketProps === 'object' && 'bucketName' in bucketProps) {
        return (bucketProps as PropertyMap).bucketName;
    }
    return undefined;
}

function convertTags(tags: PropertyValue | undefined): PropertyMap | undefined {
    if (!Array.isArray(tags)) {
        return undefined;
    }
    const result: PropertyMap = {};
    for (const tag of tags) {
        if (typeof tag !== 'object' || tag === null) {
            continue;
        }
        const key = (tag as PropertyMap).Key ?? (tag as PropertyMap).key;
        const value = (tag as PropertyMap).Value ?? (tag as PropertyMap).value;
        if (typeof key !== 'string' || value === undefined) {
            continue;
        }
        result[key] = value as PropertyValue;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function buildIamPolicyProps(props: PropertyMap): PropertyMap {
    return removeUndefined({
        description: props.Description,
        name: props.PolicyName,
        path: props.Path,
        policy: props.PolicyDocument,
    });
}

function convertServiceDiscoveryDnsConfig(value: PropertyValue | undefined): PropertyMap | undefined {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const config = value as PropertyMap;
    const dnsRecords = convertServiceDiscoveryDnsRecords(config.DnsRecords);
    const converted = removeUndefined({
        dnsRecords,
        namespaceId: config.NamespaceId,
        routingPolicy: config.RoutingPolicy,
    });
    return Object.keys(converted).length > 0 ? converted : undefined;
}

function convertServiceDiscoveryDnsRecords(value: PropertyValue | undefined): PropertyValue | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const records = value
        .map((record) => {
            if (typeof record !== 'object' || record === null) {
                return undefined;
            }
            const recordMap = record as PropertyMap;
            const converted = removeUndefined({
                ttl: (recordMap.TTL ?? recordMap.Ttl ?? recordMap.ttl) as PropertyValue | undefined,
                type: recordMap.Type,
            });
            return Object.keys(converted).length > 0 ? converted : undefined;
        })
        .filter((record): record is PropertyMap => record !== undefined);
    return records.length > 0 ? (records as PropertyValue) : undefined;
}

function convertServiceDiscoveryHealthCheckConfig(value: PropertyValue | undefined): PropertyMap | undefined {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const config = value as PropertyMap;
    const converted = removeUndefined({
        failureThreshold: config.FailureThreshold,
        resourcePath: config.ResourcePath,
        type: config.Type,
    });
    return Object.keys(converted).length > 0 ? converted : undefined;
}

function convertServiceDiscoveryHealthCheckCustomConfig(value: PropertyValue | undefined): PropertyMap | undefined {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }
    const config = value as PropertyMap;
    const converted = removeUndefined({
        failureThreshold: config.FailureThreshold,
    });
    return Object.keys(converted).length > 0 ? converted : undefined;
}

function removeUndefined(values: Record<string, PropertyValue | undefined>): PropertyMap {
    const result: PropertyMap = {};
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}

function isCustomResource(resource: ResourceIR): boolean {
    return resource.cfnType === 'AWS::CloudFormation::CustomResource' || resource.cfnType.startsWith('Custom::');
}

function findBootstrapBucket(program: ProgramIR): BootstrapBucketRef | undefined {
    const prioritized = program.stacks.filter((stack) => /StagingStack|CDKToolkit|BootstrapStack/i.test(stack.stackId));
    const stacksToSearch = prioritized.length > 0 ? prioritized : program.stacks;
    for (const stack of stacksToSearch) {
        const bucket = stack.resources.find(
            (res) => res.cfnType === 'AWS::S3::Bucket' && looksLikeBootstrapBucket(res),
        );
        if (bucket) {
            return {
                stackPath: stack.stackPath,
                logicalId: bucket.logicalId,
                resource: bucket,
            };
        }
    }
    return undefined;
}

function looksLikeBootstrapBucket(resource: ResourceIR): boolean {
    const id = resource.logicalId.toLowerCase();
    if (id.includes('stagingbucket') || id.includes('staging-bucket')) {
        return true;
    }
    if (id.includes('cdktoolkit') || id.includes('toolkit')) {
        return true;
    }
    const bucketName = (resource.props as PropertyMap)?.bucketName;
    if (typeof bucketName === 'string' && /cdk-.*-staging/i.test(bucketName)) {
        return true;
    }
    return false;
}
