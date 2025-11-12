import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws-native';
import { StackAddress } from '@pulumi/cdk-convert-core';
import { Mapping, CdkAdapterError } from '../types';

export interface ResourceAttributeRequest {
    mapping: Mapping<pulumi.Resource>;
    attribute: string;
    propertyName: string;
    resourceAddress: StackAddress;
}

export interface IntrinsicValueAdapter {
    getResourceAttribute(request: ResourceAttributeRequest): pulumi.Input<any>;
}

export class PulumiIntrinsicValueAdapter implements IntrinsicValueAdapter {
    getResourceAttribute(request: ResourceAttributeRequest): pulumi.Input<any> {
        const { mapping, attribute, propertyName, resourceAddress } = request;

        if (aws.cloudformation.CustomResourceEmulator.isInstance(mapping.resource)) {
            return mapping.resource.data.apply((attrs) => {
                const descs = Object.getOwnPropertyDescriptors(attrs);
                const descriptor = descs[attribute];
                if (!descriptor) {
                    throw new Error(
                        `No attribute ${attribute} on custom resource ${resourceAddress.id} in stack ${resourceAddress.stackPath}`,
                    );
                }
                return descriptor.value;
            });
        }

        const descriptors = Object.getOwnPropertyDescriptors(mapping.attributes || mapping.resource);
        const descriptor = descriptors[propertyName];
        if (!descriptor) {
            throw new CdkAdapterError(
                `No property ${propertyName} for attribute ${attribute} on resource ${resourceAddress.id} in stack ${resourceAddress.stackPath}`,
            );
        }
        return descriptor.value;
    }
}
