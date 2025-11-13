import * as pulumi from '@pulumi/pulumi';
import * as cdk from 'aws-cdk-lib/core';
import { debug } from '@pulumi/pulumi/log';
import { EmitResourceRequest, ResourceEmitter, StackAddress } from '@pulumi/cdk-convert-core';
import { AppComponent } from '../types';
import { ResourceMapping } from '../interop';
import { mapToAwsResource } from '../aws-resource-mappings';
import { mapToCustomResource } from '../custom-resource-mapping';
import { mapToCfnResource } from '../cfn-resource-mappings';
import { resourcesFromResourceMapping } from '../internal/interop';

export class PulumiResourceEmitter implements ResourceEmitter<ResourceMapping, pulumi.ResourceOptions, StackAddress> {
    constructor(private readonly app: AppComponent, private readonly cdkStack: cdk.Stack) {}

    emitResource(request: EmitResourceRequest<pulumi.ResourceOptions, StackAddress>): ResourceMapping {
        const { logicalId, typeName, props, options, resourceAddress } = request;
        if (this.app.appOptions?.remapCloudControlResource !== undefined) {
            const res = this.app.appOptions.remapCloudControlResource(logicalId, typeName, props, options);
            if (res !== undefined) {
                resourcesFromResourceMapping(res).forEach((r) =>
                    debug(`[CDK Adapter] remapped type ${typeName} with logicalId ${logicalId}`, r),
                );
                return res;
            }
        }

        const awsMapping = mapToAwsResource(logicalId, typeName, props, options);
        if (awsMapping !== undefined) {
            resourcesFromResourceMapping(awsMapping).forEach((r) =>
                debug(`[CDK Adapter] mapped type ${typeName} with logicalId ${logicalId} to AWS Provider resource`, r),
            );
            return awsMapping;
        }

        const customResourceMapping = mapToCustomResource(logicalId, typeName, props, options, this.cdkStack);
        if (customResourceMapping !== undefined) {
            resourcesFromResourceMapping(customResourceMapping).forEach((r) =>
                debug(`[CDK Adapter] mapped type ${typeName} with logicalId ${logicalId} to Custom resource`, r),
            );
            return customResourceMapping;
        }

        const cfnMapping = mapToCfnResource(logicalId, typeName, props, options);
        resourcesFromResourceMapping(cfnMapping).forEach((r) =>
            debug(`[CDK Adapter] mapped type ${typeName} with logicalId ${logicalId} to CCAPI resource`, r),
        );
        return cfnMapping;
    }
}
