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

interface BootstrapBucketRef {
    stackPath: string;
    logicalId: string;
    resource: ResourceIR;
}

export function postProcessProgramIr(program: ProgramIR): ProgramIR {
    const bootstrapBucket = findBootstrapBucket(program);
    return {
        ...program,
        stacks: program.stacks.map((stack) => ({
            ...stack,
            resources: rewriteResources(stack, bootstrapBucket),
        })),
    };
}

function rewriteResources(stack: StackIR, bootstrapBucket: BootstrapBucketRef | undefined): ResourceIR[] {
    const rewritten: ResourceIR[] = [];
    for (const resource of stack.resources) {
        if (resource.cfnType === 'AWS::CDK::Metadata') {
            continue;
        }

        if (resource.cfnType === 'AWS::ApiGatewayV2::Stage') {
            rewritten.push(convertApiGatewayV2Stage(resource));
            continue;
        }

        if (resource.cfnType === 'AWS::IAM::Policy') {
            rewritten.push(...convertIamPolicy(resource, stack.stackPath));
            continue;
        }

        if (isCustomResource(resource)) {
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

function convertApiGatewayV2Stage(resource: ResourceIR): ResourceIR {
    const props = resource.cfnProperties;
    const stageProps: PropertyMap = {};
    setIfDefined(stageProps, 'accessLogSettings', props.AccessLogSettings);
    setIfDefined(stageProps, 'apiId', props.ApiId);
    setIfDefined(stageProps, 'autoDeploy', props.AutoDeploy);
    setIfDefined(stageProps, 'clientCertificateId', props.ClientCertificateId);
    setIfDefined(stageProps, 'defaultRouteSettings', props.DefaultRouteSettings);
    setIfDefined(stageProps, 'deploymentId', props.DeploymentId);
    setIfDefined(stageProps, 'description', props.Description);
    setIfDefined(stageProps, 'name', props.StageName);
    setIfDefined(stageProps, 'routeSettings', props.RouteSettings);
    setIfDefined(stageProps, 'stageVariables', props.StageVariables);

    const tags = convertTags(props.Tags);
    if (tags) {
        stageProps.tags = tags;
    }

    return {
        ...resource,
        typeToken: 'aws:apigatewayv2/stage:Stage',
        props: stageProps,
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
    const result: PropertyMap = {};
    setIfDefined(result, 'description', props.Description);
    setIfDefined(result, 'name', props.PolicyName);
    setIfDefined(result, 'path', props.Path);
    setIfDefined(result, 'policy', props.PolicyDocument);
    return result;
}

function setIfDefined(target: PropertyMap, key: string, value: PropertyValue | undefined): void {
    if (value !== undefined) {
        target[key] = value;
    }
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
