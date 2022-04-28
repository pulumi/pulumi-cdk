import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { Construct } from 'constructs';
import { Service, Source } from '@aws-cdk/aws-apprunner-alpha';
import { CfnOutput } from 'aws-cdk-lib';

class AppRunnerStack extends pulumicdk.Stack {
    constructor(id: string) {
        super(id);

        const service = new Service(this, 'service', {
            source: Source.fromEcrPublic({
                imageConfiguration: { port: 8000 },
                imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
            }),
        });

        new CfnOutput(this, 'url', { value: service.serviceUrl });
    }
}

const stack = new AppRunnerStack('teststack');
export const url = stack.outputs['url'];
