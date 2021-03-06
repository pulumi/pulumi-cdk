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

export interface CloudFormationParameter {
    readonly Type: string;
    readonly Default?: any;
}

export interface CloudFormationResource {
    readonly Type: string;
    readonly Properties: any;
    readonly Condition?: string;
    readonly DependsOn?: string | string[];
}

export interface CloudFormationTemplate {
    Parameters?: { [id: string]: CloudFormationParameter };
    Resources?: { [id: string]: CloudFormationResource };
    Conditions?: { [id: string]: any };
    Outputs?: { [id: string]: any };
}

export function getDependsOn(resource: CloudFormationResource): string[] | undefined {
    return typeof resource.DependsOn === 'string' ? [resource.DependsOn] : resource.DependsOn;
}
