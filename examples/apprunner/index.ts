import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { Service, Source } from '@aws-cdk/aws-apprunner-alpha';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class AppRunnerStack extends pulumicdk.Stack {
    url: pulumi.Output<string>;

    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

        const service = new Service(this, 'service', {
            source: Source.fromEcrPublic({
                imageConfiguration: { port: 8000 },
                imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
            }),
        });

        this.url = this.asOutput(service.serviceUrl);
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new AppRunnerStack(scope, `${prefix}-apprunner`);
            return { url: stack.url };
        });
    }
}

const app = new MyApp();
export const url = app.outputs['url'];
