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

import { Token, IResolvable } from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';

const glob = global as any;

export interface OutputRef {
    Ref: OutputRepr;
}

export interface OutputRepr {
    PulumiOutput: number;
}

export class OutputMap {
    public static instance(): OutputMap {
        if (glob.__pulumiOutputMap === undefined) {
            glob.__pulumiOutputMap = new OutputMap();
        }
        return glob.__pulumiOutputMap;
    }

    private readonly outputMap = new Map<number, pulumi.Output<any>>();
    private outputId = 0;

    public registerOutput(o: pulumi.Output<any>): OutputRef {
        const id = this.outputId++;
        this.outputMap.set(id, o);
        return { Ref: { PulumiOutput: id } };
    }

    public lookupOutput(o: OutputRepr): pulumi.Output<any> | undefined {
        return this.outputMap.get(o.PulumiOutput);
    }
}
