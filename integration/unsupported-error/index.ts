import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as servicecatalog from 'aws-cdk-lib/aws-servicecatalog';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class UnsupportedErrorStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        new servicecatalog.Portfolio(this, 'Portfolio', {
            displayName: 'test',
            providerName: 'test',
            description: 'test',
        });
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new UnsupportedErrorStack(scope, `${prefix}-unsupported`);
});
