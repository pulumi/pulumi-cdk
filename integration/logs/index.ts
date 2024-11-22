import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs_destinations from 'aws-cdk-lib/aws-logs-destinations';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as pulumicdk from '@pulumi/cdk';
import { RemovalPolicy } from 'aws-cdk-lib/core';

class LogsStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        const logGroup = new logs.LogGroup(this, 'LogGroup', {
            retention: logs.RetentionDays.ONE_DAY,
        });
        new logs.LogStream(this, 'LogStream', {
            logGroup,
        });
        new logs.MetricFilter(this, 'MetricFilter', {
            logGroup,
            filterPattern: logs.FilterPattern.allTerms('ERROR'),
            metricNamespace: 'MyApp',
            metricName: 'ErrorCount',
        });
        const queryString = new logs.QueryString({
            fields: ['@timestamp', '@message'],
            sort: '@timestamp desc',
            limit: 20,
        });
        new logs.QueryDefinition(this, 'QueryDefinition', {
            queryString,
            logGroups: [logGroup],
            queryDefinitionName: 'cdk-test-query',
        });

        logGroup.addToResourcePolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                resources: ['*'],
                actions: ['logs:PutLogEvents'],
                principals: [new iam.ServicePrincipal('logs.amazonaws.com')],
            }),
        );

        const logGroup2 = new logs.LogGroup(this, 'LogGroup2', {
            retention: logs.RetentionDays.ONE_DAY,
        });
        const stream = new kinesis.Stream(this, 'stream', {
            encryption: kinesis.StreamEncryption.UNENCRYPTED,
            removalPolicy: RemovalPolicy.DESTROY,
        });
        logGroup2.addSubscriptionFilter('cdk-filter', {
            destination: new logs_destinations.KinesisDestination(stream),
            filterPattern: logs.FilterPattern.allTerms('ERROR'),
        });
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new LogsStack(scope, 'teststack');
});
