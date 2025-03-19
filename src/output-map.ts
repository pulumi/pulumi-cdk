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

const glob = global as any;

/**
 * A serializable reference to an output.
 */
export interface OutputRef {
    /**
     * The name of this field has to be `Ref` so that `Token.asString` CDK functionality can be called on an `OutputRef`
     * and it can travel through the CDK internals. An alternative to this special encoding could be implementing CDK
     * `IResolvable` on these values.
     */
    Ref: OutputRepr;
}

/**
 * See `OutputRef`.
 */
export interface OutputRepr {
    /**
     * An arbitrary integer identifying the output.
     */
    PulumiOutput: number;
}

/**
 * Recognize if something is an `OutputRepr`.
 */
export function isOutputReprInstance(x: any): boolean {
    return typeof x === 'object' && Object.prototype.hasOwnProperty.call(x, 'PulumiOutput');
}

/**
 * Stores Pulumi Output values in memory so that they can be encoded into serializable `OutputRef` values with unique
 * integers for CDK interop.
 */
export class OutputMap {
    /**
     * Get the global instance.
     */
    public static instance(): OutputMap {
        if (glob.__pulumiOutputMap === undefined) {
            glob.__pulumiOutputMap = new OutputMap();
        }
        return glob.__pulumiOutputMap;
    }

    private readonly outputMap = new Map<number, pulumi.Output<any>>();
    private outputId = 0;

    /**
     * Stores a reference to a Pulumi Output in the map and returns a serializable reference.
     */
    public registerOutput(o: pulumi.Output<any>): OutputRef {
        const id = this.outputId++;
        this.outputMap.set(id, o);
        return { Ref: { PulumiOutput: id } };
    }

    /**
     * Tries to look up an output reference in the map and find the original value.
     */
    public lookupOutput(o: OutputRepr): pulumi.Output<any> | undefined {
        return this.outputMap.get(o.PulumiOutput);
    }
}
