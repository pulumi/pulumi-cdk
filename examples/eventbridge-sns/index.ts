import * as pulumicdk from '@pulumi/cdk';
import {
    aws_events,
    aws_events_targets,
    aws_lambda,
    aws_lambda_nodejs,
    aws_sns,
    aws_sns_subscriptions,
    aws_sqs,
} from 'aws-cdk-lib';

class EventBridgeSnsStack extends pulumicdk.Stack {
    constructor(scope: pulumicdk.App, id: string) {
        super(scope, id);

        const eventBus = new aws_events.EventBus(this, 'Bus');
        const handler = new aws_lambda_nodejs.NodejsFunction(this, 'handler', {
            runtime: aws_lambda.Runtime.NODEJS_LATEST,
            environment: {
                BUS_NAME: eventBus.eventBusName,
            },
        });
        eventBus.grantPutEventsTo(handler);

        // create an archive so we can replay events later
        eventBus.archive('archive', {
            eventPattern: {
                source: ['custom.myATMapp'],
            },
        });

        const approvedRule = new aws_events.Rule(this, 'approved-rule', {
            eventBus,
            description: 'Approved transactions',
            eventPattern: {
                source: ['custom.myATMapp'],
                detailType: ['transaction'],
                detail: {
                    result: ['approved'],
                },
            },
        });

        const approvedTopic = new aws_sns.Topic(this, 'approved-topic');

        approvedRule.addTarget(new aws_events_targets.SnsTopic(approvedTopic));

        const approvedQueue = new aws_sqs.Queue(this, 'approved-queue');
        approvedTopic.addSubscription(
            new aws_sns_subscriptions.SqsSubscription(approvedQueue, {
                rawMessageDelivery: true,
            }),
        );

        const deniedRule = new aws_events.Rule(this, 'denied-rule', {
            eventBus,
            description: 'Denied transactions',
            eventPattern: {
                source: ['custom.myATMapp'],
                detailType: ['transaction'],
                detail: {
                    result: ['denied'],
                },
            },
        });
        const deniedTopic = new aws_sns.Topic(this, 'denied-topic');
        deniedRule.addTarget(new aws_events_targets.SnsTopic(deniedTopic));

        const deniedQueue = new aws_sqs.Queue(this, 'denied-queue');
        deniedTopic.addSubscription(
            new aws_sns_subscriptions.SqsSubscription(deniedQueue, {
                rawMessageDelivery: true,
            }),
        );
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App) => {
            new EventBridgeSnsStack(scope, 'eventbridge-sns-stack');
        });
    }
}

new MyApp();
