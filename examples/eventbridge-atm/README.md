# The EventBridge ATM

> NOTE: converted from https://github.com/cdk-patterns/serverless/blob/main/the-eventbridge-atm/typescript/README.md

This is an example CDK stack to deploy the code from this blogpost by [James
Beswick](https://twitter.com/jbesw)-
https://aws.amazon.com/blogs/compute/integrating-amazon-eventbridge-into-your-serverless-applications/

In this example, a banking application for automated teller machine (ATM)
produces events about transactions. It sends the events to EventBridge, which
then uses rules defined by the application to route accordingly. There are
three downstream services consuming a subset of these events.

![Architecture](img/amazon-eventbridge-custom-application-2.png)

## When You Would Use This Pattern

EventBridge is an awesome centralised service for routing events between
various consumers based on rules. You could set up an EventBridge within your
domain and then accessing events within that domain is as easy as a rule in
EventBridge, this significantly cuts down on the number of coupled interactions
you have between your various services.

## How to test pattern 

After deployment you will have an api gateway where hitting any endpoint
triggers the events to be sent to EventBridge defined in
lambdas/atmProducer/events.js

* All Approved transactions go to consumer 1 NY Transactions go to consumer 2
* Declined transactions go to consumer 3

