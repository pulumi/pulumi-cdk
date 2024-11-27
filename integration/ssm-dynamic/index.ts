import * as pulumi from '@pulumi/pulumi';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as pulumicdk from '@pulumi/cdk';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class SsmDynamicStack extends pulumicdk.Stack {
    public readonly stringValue: pulumi.Output<string>;
    public readonly stringListValue: pulumi.Output<string[]>;
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);

        const stringParam = new ssm.StringParameter(this, 'testparam', {
            parameterName: `${prefix}-param`,
            stringValue: 'testvalue',
        });
        this.stringValue = this.asOutput(stringParam.stringValue);

        const listParam = new ssm.StringListParameter(this, 'testparamlist', {
            parameterName: `${prefix}-listparam`,
            stringListValue: ['abcd', 'xyz'],
        });
        this.stringListValue = this.asOutput(listParam.stringListValue);
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new SsmDynamicStack(scope, `${prefix}-misc`);
    return {
        stringValue: stack.stringValue,
        stringListValue: stack.stringListValue,
    };
});
export const stringValue = app.outputs['stringValue'];
export const stringListValue = app.outputs['stringListValue'];
