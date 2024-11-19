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

export interface CloudFormationParameter {
    readonly Type: string;
    readonly Default?: any;
}

export interface CloudFormationResource {
    readonly Type: string;
    readonly Properties: any;
    readonly Condition?: string;
    readonly DeletionPolicy?: CfnDeletionPolicy;
    readonly DependsOn?: string | string[];
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
    Outputs?: { [id: string]: any };
}

export function getDependsOn(resource: CloudFormationResource): string[] | undefined {
    return typeof resource.DependsOn === 'string' ? [resource.DependsOn] : resource.DependsOn;
}
