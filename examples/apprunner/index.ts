import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { Construct } from 'constructs';
import { Service, Source } from '@aws-cdk/aws-apprunner-alpha';
import { CfnOutput } from 'aws-cdk-lib';

class AppRunnerStack extends pulumicdk.Stack {
    url: pulumi.Output<string>;

    constructor(id: string) {
        super(id);

        const service = new Service(this, 'service', {
            source: Source.fromEcrPublic({
                imageConfiguration: { port: 8000 },
                imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
            }),
        });

        this.url = this.asOutput(service.serviceUrl);

        this.synth();
    }
}

const stack = new AppRunnerStack('teststack');
export const url = stack.url;
