import * as pulumi from '@pulumi/pulumi';
import * as events from 'aws-cdk-lib/aws-events';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as pulumicdk from '@pulumi/cdk';
import { SecretValue } from 'aws-cdk-lib';
import { AwsCliLayer } from 'aws-cdk-lib/lambda-layer-awscli';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class MiscServicesStack extends pulumicdk.Stack {
    public readonly repoName: pulumi.Output<string>;
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        const repo = new ecr.Repository(this, 'testrepo');
        repo.grantPull(new iam.ServicePrincipal('lambda.amazonaws.com'));
        this.repoName = this.asOutput(repo.repositoryName);

        new ssm.StringParameter(this, 'testparam', {
            stringValue: 'testvalue',
        });

        const eventBus = new events.EventBus(this, 'testbus');
        eventBus.addToResourcePolicy(
            new iam.PolicyStatement({
                sid: 'testsid',
                actions: ['events:PutEvents'],
                principals: [new iam.AccountRootPrincipal()],
                resources: [eventBus.eventBusArn],
            }),
        );

        // This type of event bus policy is created for cross account access
        new events.CfnEventBusPolicy(this, 'bus-policy', {
            action: 'events:PutEvents',
            statementId: 'statement-id',
            principal: new iam.AccountRootPrincipal().accountId,
        });
        const connection = new events.Connection(this, 'testconn', {
            authorization: events.Authorization.basic('user', SecretValue.unsafePlainText('password')),
        });
        new events.ApiDestination(this, ' testdest', {
            endpoint: 'https://example.com',
            connection,
        });

        const fn = new lambda.Function(this, 'testfn', {
            runtime: lambda.Runtime.PYTHON_3_12,
            handler: 'index.handler',
            code: lambda.Code.fromInline('def handler(event, context): return {}'),
        });
        fn.addLayers(new AwsCliLayer(this, 'testlayer'));

        const errors = fn.metricErrors();
        const throttles = fn.metricThrottles();
        const throttleAlarm = throttles.createAlarm(this, 'alarm-throttles', { threshold: 1, evaluationPeriods: 1 });
        const errorsAlarm = errors.createAlarm(this, 'alarm-errors', { threshold: 1, evaluationPeriods: 1 });
        const alarmRule = cloudwatch.AlarmRule.anyOf(throttleAlarm, errorsAlarm);
        new cloudwatch.CompositeAlarm(this, 'compositealarm', {
            alarmRule,
        });

        const dashboard = new cloudwatch.Dashboard(this, 'testdash');
        dashboard.addWidgets(
            new cloudwatch.GraphWidget({
                left: [errors],
            }),
        );

        new iam.User(this, 'User', {
            groups: [new iam.Group(this, 'Group')],
            managedPolicies: [
                new iam.ManagedPolicy(this, 'ManagedPolicy', {
                    statements: [
                        new iam.PolicyStatement({
                            actions: ['s3:*'],
                            resources: ['*'],
                            effect: iam.Effect.DENY,
                        }),
                    ],
                }),
            ],
        });

        new lambda.Function(this, 'FindInMapFunc', {
            runtime: lambda.Runtime.NODEJS_LATEST,
            handler: 'index.handler',
            code: lambda.Code.fromInline('def handler(event, context): return {}'),
            // this adds a Fn::FindInMap
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_317_0,
        });
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new MiscServicesStack(scope, `${prefix}-misc`);
    return {
        repoName: stack.repoName,
    };
});
export const repoName = app.outputs['repoName'];
