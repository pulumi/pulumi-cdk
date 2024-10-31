// Copyright 2016-2024, Pulumi Corporation.
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
import { DEPLOY_TIME_PREFIX } from '../synthesizer';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, GetObjectCommand, PutObjectCommand, waitUntilObjectExists } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { randomUUID } from 'crypto';
import { WaiterState } from "@smithy/util-waiter";
import {
    CloudFormationCustomResourceCreateEvent,
    CloudFormationCustomResourceDeleteEvent,
    CloudFormationCustomResourceEvent,
    CloudFormationCustomResourceResourcePropertiesCommon,
    CloudFormationCustomResourceResponse,
    CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';

// This is just a hack for prototyping, we should implement this as a proper
// resource in aws-native

export interface CfnCustomResourceArgs {
    stagingBucket: string;
    /**
     * The maximum time, in seconds, that can elapse before a custom resource operation times out.
     * The value must be an integer from 1 to 3600. The default value is 3600 seconds (1 hour).
     */
    timeout?: number;
    // The name or ARN of the Lambda function, version, or alias.
    lambdaArn: string;
    properties: CloudFormationCustomResourceResourcePropertiesCommon;

    resourceType: string;
    logicalId: string;
    stackId: string;
}

export type CfnCustomResourceInputs = {
    [K in keyof CfnCustomResourceArgs]: pulumi.Input<CfnCustomResourceArgs[K]>;
}

export type CfnCustomResourceState = {
    attributes: { [key: string]: any },
    physicalResourceId: string,
    "__pulumi_cdk_physical_resource_id": string
    "__pulumi_cdk_resource_properties": CloudFormationCustomResourceResourcePropertiesCommon,
    "__pulumi_cdk_service_token": string,
    "__pulumi_cdk_staging_bucket": string,
    "__pulumi_cdk_stack_id": string,
    "__pulumi_cdk_logical_resource_id": string,
    "__pulumi_cdk_resource_type": string,
}

interface AwsClients {
    s3: S3Client;
    lambda: LambdaClient;
}

export class CfnCustomResourceProvider implements pulumi.dynamic.ResourceProvider<CfnCustomResourceArgs, CfnCustomResourceState> {

    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    async create(inputs: CfnCustomResourceArgs) {
        // todo validate that the service token is a lambda arn
        const { s3, lambda } = this.getAwsClients();
        const requestId = randomUUID();
        const payload: Omit<CloudFormationCustomResourceCreateEvent, "ResponseURL"> = {
            RequestType: 'Create',
            ServiceToken: inputs.lambdaArn,
            StackId: inputs.stackId,
            RequestId: requestId,
            LogicalResourceId: inputs.logicalId,
            ResourceType: inputs.resourceType,
            ResourceProperties: inputs.properties,
        };

        const response = await this.invokeCustomResource(lambda, s3, inputs.lambdaArn, inputs.stagingBucket, payload, inputs.timeout ?? 3600);
        // pulumi doesn't allow changing the id after creation, so we need to return the logicalId as the id
        return { id: inputs.logicalId, outs: {
            attributes: response.Data ?? {},
            physicalResourceId: response.PhysicalResourceId,
            // todo make them proper props, this is just a leftover from previous experiments
            "__pulumi_cdk_physical_resource_id": response.PhysicalResourceId,
            "__pulumi_cdk_resource_properties": inputs.properties,
            "__pulumi_cdk_service_token": inputs.lambdaArn,
            "__pulumi_cdk_staging_bucket": inputs.stagingBucket,
            "__pulumi_cdk_stack_id": inputs.stackId,
            "__pulumi_cdk_logical_resource_id": inputs.logicalId,
            "__pulumi_cdk_resource_type": inputs.resourceType
        } };
    }

    async update(id: string, olds: CfnCustomResourceState, news: CfnCustomResourceArgs) {
        const requestId = randomUUID();
        const event: Omit<CloudFormationCustomResourceUpdateEvent, "ResponseURL"> = {
            RequestType: 'Update',
            PhysicalResourceId: olds.__pulumi_cdk_physical_resource_id,
            OldResourceProperties: olds.__pulumi_cdk_resource_properties,
            ServiceToken: news.lambdaArn,
            StackId: news.stackId,
            RequestId: requestId,
            LogicalResourceId: news.logicalId,
            ResourceType: news.resourceType,
            ResourceProperties: news.properties,
        }

        const { s3, lambda } = this.getAwsClients();
        const response = await this.invokeCustomResource(lambda, s3, news.lambdaArn, news.stagingBucket, event, news.timeout ?? 3600);
        
        // If the PhysicalResourceId has changed, we need to delete the old resource
        if (response.PhysicalResourceId !== olds.__pulumi_cdk_physical_resource_id) {
            const deleteEvent: Omit<CloudFormationCustomResourceDeleteEvent, "ResponseURL"> = {
                RequestType: 'Delete',
                PhysicalResourceId: olds.__pulumi_cdk_physical_resource_id,
                ServiceToken: news.lambdaArn,
                StackId: news.stackId,
                RequestId: requestId,
                LogicalResourceId: olds.__pulumi_cdk_logical_resource_id,
                ResourceType: olds.__pulumi_cdk_resource_type,
                ResourceProperties: olds.__pulumi_cdk_resource_properties,
            }
            await this.invokeCustomResource(lambda, s3, news.lambdaArn, news.stagingBucket, deleteEvent, 3600);
        }
        
        return {outs: {
            attributes: response.Data ?? {},
            physicalResourceId: response.PhysicalResourceId,
            "__pulumi_cdk_physical_resource_id": response.PhysicalResourceId,
            "__pulumi_cdk_resource_properties": news.properties,
            "__pulumi_cdk_service_token": news.lambdaArn,
            "__pulumi_cdk_staging_bucket": news.stagingBucket,
            "__pulumi_cdk_stack_id": news.stackId,
            "__pulumi_cdk_logical_resource_id": news.logicalId,
            "__pulumi_cdk_resource_type": news.resourceType
        }};
    }

    async delete(id: string, props: CfnCustomResourceState) {
        const requestId = randomUUID();
        const event: Omit<CloudFormationCustomResourceDeleteEvent, "ResponseURL"> = {
            RequestType: 'Delete',
            PhysicalResourceId: props.__pulumi_cdk_physical_resource_id,
            ServiceToken: props.__pulumi_cdk_service_token,
            StackId: props.__pulumi_cdk_stack_id,
            RequestId: requestId,
            LogicalResourceId: props.__pulumi_cdk_logical_resource_id,
            ResourceType: props.__pulumi_cdk_resource_type,
            ResourceProperties: props.__pulumi_cdk_resource_properties,
        }

        const { s3, lambda } = this.getAwsClients();
        // todo add timeout to state
        const response = await this.invokeCustomResource(lambda, s3, props.__pulumi_cdk_service_token, props.__pulumi_cdk_staging_bucket, event, 3600);
    }

    private getAwsClients(): AwsClients {
        // TODO retrieve creds from aws.config or via args
        const s3Client = new S3Client({});
        const lambdaClient = new LambdaClient({});
        return { s3: s3Client, lambda: lambdaClient };
    }

    private async invokeCustomResource(lambda: LambdaClient, s3: S3Client, lambdaArn: string, stagingBucket: string, payload: Payload, timeout: number): Promise<CloudFormationCustomResourceResponse> {
        const id = randomUUID();
        const bucketKey = `${DEPLOY_TIME_PREFIX}pulumi/custom-resources/${id}`;
        const putCommand = new PutObjectCommand({
            Bucket: stagingBucket,
            Key: bucketKey,
        });
        const responseUrl = await getSignedUrl(s3, putCommand, { expiresIn: timeout });

        const requestData: CloudFormationCustomResourceEvent = {
            ...payload,
            ResponseURL: responseUrl,
        };

        const invokeCommand = new InvokeCommand({
            FunctionName: lambdaArn,
            Payload: JSON.stringify(requestData),
        });

        const lambdaInvokeResult = await lambda.send(invokeCommand);

        if ((lambdaInvokeResult.StatusCode && lambdaInvokeResult.StatusCode >= 400) || lambdaInvokeResult.FunctionError) {
            throw new Error(`Failed to invoke Lambda function for Custom Resource: ${lambdaInvokeResult.FunctionError}`);
        }

        const waiterResult = await waitUntilObjectExists({ client: s3, maxWaitTime: timeout }, { Bucket: stagingBucket, Key: bucketKey });

        if (waiterResult.state !== WaiterState.SUCCESS) {
            throw new Error(`Failed to wait for object to exist: ${waiterResult.reason}`);
        }

        const getCommand = new GetObjectCommand({
            Bucket: stagingBucket,
            Key: bucketKey,
        });

        let response: string | undefined;
        try {
            response = await (await s3.send(getCommand)).Body?.transformToString();
        } catch (err: any) {
            throw new Error(`Failed to get object: ${err.message}`);
        }

        if (!response || response.length === 0) {
            throw new Error(`Failed to get object: response is empty`);
        }
        
        let responseObj: CloudFormationCustomResourceResponse;
        try {
            responseObj = JSON.parse(response);
        } catch (err: any) {
            throw new Error(`Failed to parse response: ${err.message}`);
        }

        return responseObj;
    }
}

type Payload = Omit<CloudFormationCustomResourceCreateEvent, "ResponseURL"> | Omit<CloudFormationCustomResourceUpdateEvent, "ResponseURL"> | Omit<CloudFormationCustomResourceDeleteEvent, "ResponseURL">;

type DynResourceState = {
    attributes?: pulumi.Input<{ [key: string]: any }>,
    physicalResourceId?: pulumi.Input<string>,
} & CfnCustomResourceInputs;

export class CfnCustomResource extends pulumi.dynamic.Resource {
    public readonly physicalResourceId!: pulumi.Output<string>;
    public readonly attributes!: pulumi.Output<{ [key: string]: any }>;

    constructor(name: string, argsOrState: CfnCustomResourceInputs | DynResourceState, opts?: pulumi.CustomResourceOptions) {
        let resourceInputs: pulumi.Inputs = {};
        opts = opts || {};
        if (opts.id) {
            const state = argsOrState as DynResourceState | undefined;
            resourceInputs["physicalResourceId"] = state?.physicalResourceId ?? undefined;
            resourceInputs["attributes"] = state?.attributes ?? undefined;
            resourceInputs["stagingBucket"] = state?.stagingBucket ?? undefined;
            resourceInputs["timeout"] = state?.timeout ?? undefined;
            resourceInputs["lambdaArn"] = state?.lambdaArn ?? undefined;
            resourceInputs["properties"] = state?.properties ?? undefined;
            resourceInputs["resourceType"] = state?.resourceType ?? undefined;
            resourceInputs["logicalId"] = state?.logicalId ?? undefined;
            resourceInputs["stackId"] = state?.stackId ?? undefined;
        } else {
            const args = argsOrState as CfnCustomResourceInputs | undefined;
            resourceInputs["physicalResourceId"] = undefined;
            resourceInputs["attributes"] = undefined;
            resourceInputs["stagingBucket"] = args?.stagingBucket ?? undefined;
            resourceInputs["timeout"] = args?.timeout ?? undefined;
            resourceInputs["lambdaArn"] = args?.lambdaArn ?? undefined;
            resourceInputs["properties"] = args?.properties ?? undefined;
            resourceInputs["resourceType"] = args?.resourceType ?? undefined;
            resourceInputs["logicalId"] = args?.logicalId ?? undefined;
            resourceInputs["stackId"] = args?.stackId ?? undefined;
        }

        super(new CfnCustomResourceProvider(name), name, resourceInputs, opts);
    }

    static isInstance(obj: any): obj is CfnCustomResource {
        return obj instanceof CfnCustomResource;
    }
}
