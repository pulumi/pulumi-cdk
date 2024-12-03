import * as pulumi from '@pulumi/pulumi';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as pulumicdk from '@pulumi/cdk';
import { CfnDynamicReference, CfnDynamicReferenceService } from 'aws-cdk-lib';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class SsmDynamicStack extends pulumicdk.Stack {
    public readonly stringValue: pulumi.Output<string>;
    public readonly stringListValue: pulumi.Output<string[]>;
    public readonly dynamicStringValue: pulumi.Output<string>;
    public readonly dynamicStringListValue: pulumi.Output<string[]>;
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

        const stringValue = new CfnDynamicReference(CfnDynamicReferenceService.SSM, `${prefix}-param`).toString();
        const stringDynamicParam = new ssm.StringParameter(this, 'stringDynamicParam', {
            stringValue: stringValue,
        });
        this.dynamicStringValue = this.asOutput(stringDynamicParam.stringValue);

        const stringListValue = new CfnDynamicReference(
            CfnDynamicReferenceService.SSM,
            `${prefix}-listparam`,
        ).toString();
        const stringListDynamicParam = new ssm.StringParameter(this, 'stringListDynamicParam', {
            stringValue: stringListValue,
        });
        this.dynamicStringListValue = this.asOutput(stringListDynamicParam.stringValue).apply((v) => v.split(','));
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new SsmDynamicStack(scope, `${prefix}-misc`);
    return {
        stringValue: stack.stringValue,
        stringListValue: stack.stringListValue,
        dynamicStringValue: stack.dynamicStringValue,
        dynamicStringListValue: stack.dynamicStringListValue,
    };
});
export const stringValue = app.outputs['stringValue'];
export const stringListValue = app.outputs['stringListValue'];
export const dynamicStringValue = app.outputs['dynamicStringValue'];
export const dynamicStringListValue = app.outputs['dynamicStringListValue'];
