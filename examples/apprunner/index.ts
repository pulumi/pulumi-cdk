import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as pulumi from '@pulumi/pulumi';
import { Stack } from '@pulumi/cdk/interop-aspect';
import { Construct } from 'constructs';
import { Service, Source } from '@aws-cdk/aws-apprunner-alpha';
import { CfnOutput } from 'aws-cdk-lib';

class AppRunnerStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const service = new Service(this, 'service', {
            source: Source.fromEcrPublic({
                imageConfiguration: { port: 8000 },
                imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
            }),
        });

        new CfnOutput(this, 'url', { value: service.serviceUrl });
    }
}

const stack = Stack.create('teststack', AppRunnerStack);
export const url = stack.outputs['url'];
