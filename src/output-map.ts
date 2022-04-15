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
