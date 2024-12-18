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

import { CfnDeletionPolicy } from 'aws-cdk-lib/core';
import { StackAddress } from './assembly';

/**
 * Represents a CF parameter declaration from the Parameters template section.
 *
 * See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html
 */
export interface CloudFormationParameter {
    /**
     * DataType such as 'String'.
     */
    readonly Type: string;

    readonly Default?: any;
}

export interface CloudFormationParameterWithId extends CloudFormationParameter {
    stackAddress: StackAddress;
}

export interface CloudFormationResource {
    readonly Type: string;
    readonly Properties: any;
    readonly Condition?: string;
    readonly DeletionPolicy?: CfnDeletionPolicy;
    readonly DependsOn?: string | string[];
    readonly Metadata?: { [key: string]: any };
}

export interface CloudFormationOutput {
    Value: any;
}

export type CloudFormationMapping = { [mappingLogicalName: string]: TopLevelMapping };
export type CloudFormationMappingValue = string | string[];
export type TopLevelMapping = { [key: string]: SecondLevelMapping };
export type SecondLevelMapping = { [key: string]: CloudFormationMappingValue };

/**
 * Models CF conditions. These are possibly nested expressions evaluating to a boolean.
 *
 * Example value:
 *
 *     {"Fn::Equals": [{"Ref": "EnvType"}, "prod"]}
 *
 * See https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/conditions-section-structure.html
 */
export interface CloudFormationCondition {}

export interface CloudFormationTemplate {
    Parameters?: { [id: string]: CloudFormationParameter };
    Resources?: { [id: string]: CloudFormationResource };
    Conditions?: { [id: string]: CloudFormationCondition };
    Mappings?: CloudFormationMapping;
    Outputs?: { [id: string]: CloudFormationOutput };
}

export interface NestedStackTemplate extends CloudFormationTemplate {
    /**
     * The logical ID identifying the nested stack in the parent stack.
     */
    logicalId: string;
}

export function isNestedStackTemplate(template: CloudFormationTemplate): template is NestedStackTemplate {
    return 'logicalId' in template;
}

export function getDependsOn(resource: CloudFormationResource): string[] | undefined {
    return typeof resource.DependsOn === 'string' ? [resource.DependsOn] : resource.DependsOn;
}
