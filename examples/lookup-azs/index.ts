import * as pulumicdk from '@pulumi/cdk';
import * as pulumi from '@pulumi/pulumi';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Fn } from 'aws-cdk-lib';
import { Output } from '@pulumi/pulumi';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class LookupAzsStack extends pulumicdk.Stack {
    public readonly azs: Output<string[]>;
    constructor(app: pulumicdk.App, id: string) {
        super(app, id, {
            props: { env: app.env },
        });

        const vpc = new ec2.Vpc(this, 'MyVpc', { maxAzs: 3 });
        this.azs = this.asOutput(vpc.availabilityZones);
    }

    // You can override the availabilityZones property to perform a lookup.
    // Here I have specified that I want 3 availability zones. This uses Intrinsics, which
    // behind the scenes are backed by Pulumi functions (e.g. aws_native.getAzs()).
    // This allows us to get around the limitation of not being able to use Output values here.
    get availabilityZones(): string[] {
        return [Fn.select(0, Fn.getAzs()), Fn.select(1, Fn.getAzs()), Fn.select(2, Fn.getAzs())];
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new LookupAzsStack(scope, `${prefix}-azs`);
            return {
                azs: stack.azs,
            };
        });
    }
}

const app = new MyApp();
export const azs = app.outputs['azs'];
