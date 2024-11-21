import * as logs from 'aws-cdk-lib/aws-logs';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as native from '@pulumi/aws-native';
import { RemovalPolicy } from 'aws-cdk-lib';

const config = new pulumi.Config();
const cdkRegion = config.get('cdk-region');
const cdkAccount = config.get('cdk-account');
const defaultRegion = config.get('default-region');

export class StackProviderStack extends pulumicdk.Stack {
    public readonly logsRegion: pulumi.Output<string>;
    constructor(app: pulumicdk.App, id: string, providers?: pulumi.ProviderResource[]) {
        super(app, id, {
            providers,
            props:
                cdkRegion || cdkAccount
                    ? {
                          env: {
                              region: cdkRegion,
                              account: cdkAccount,
                          },
                      }
                    : undefined,
        });

        const group = new logs.LogGroup(this, 'group', {
            retention: logs.RetentionDays.ONE_DAY,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        this.logsRegion = this.asOutput(group.logGroupArn).apply((arn) => arn.split(':')[3]);
    }
}

const app = new pulumicdk.App(
    'app',
    (scope: pulumicdk.App) => {
        const stack = new StackProviderStack(scope, 'teststack', [
            new native.Provider('ccapi-provider', {
                region: 'us-east-1', // a different region from the app provider
            }),
        ]);
        const defaultStack = new StackProviderStack(scope, 'default-stack');
        return {
            east1LogsRegion: stack.logsRegion,
            east1StackRegion: stack.asOutput(stack.region),
            defaultLogsRegion: defaultStack.logsRegion,
            defaultStackRegion: defaultStack.asOutput(defaultStack.region),
        };
    },
    {
        providers: defaultRegion
            ? [
                  new native.Provider('app-provider', {
                      region: defaultRegion as native.Region, // a different region from the default env
                  }),
              ]
            : undefined,
    },
);

// You can (we check for this though) configure a different region on the provider
// that the stack uses vs the region in the CDK StackProps. This tests checks that both the
// stack region and the region the resources are deployed to are the same.
export const east1LogsRegion = app.outputs['east1LogsRegion'];
export const defaultLogsRegion = app.outputs['defaultLogsRegion'];
export const east1StackRegion = app.outputs['east1StackRegion'];
export const defaultStackRegion = app.outputs['defaultStackRegion'];
