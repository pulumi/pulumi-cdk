import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as pulumi from "@pulumi/pulumi";
import { CdkStackComponent, AwsPulumiAdapter } from "@pulumi/cdk/interop-aspect";
import { Construct } from "constructs";
import { Service, Source } from "@aws-cdk/aws-apprunner-alpha"
import { CfnOutput } from 'aws-cdk-lib';

const stack = new CdkStackComponent("teststack", (scope: Construct, parent: CdkStackComponent) => {
    const adapter = new AwsPulumiAdapter(scope, "adapter", parent);

    const service = new Service(adapter, 'service', {
        source: Source.fromEcrPublic({
            imageConfiguration: { port: 8000 },
            imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
        }),
    });

    new CfnOutput(adapter, "url", { value: service.serviceUrl })
    return adapter;
});

export const url = stack.outputs["url"];
