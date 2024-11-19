# Pulumi CDK Adapter (preview)

The Pulumi CDK Adapter is a library that enables
[Pulumi](https://github.com/pulumi/pulumi) programs to use [AWS
CDK](https://github.com/aws/aws-cdk) constructs.

The adapter allows writing AWS CDK code as part of an AWS CDK Stack inside a
Pulumi program, and having the resulting AWS resources be deployed and managed
via Pulumi.  Outputs of resources defined in a Pulumi program can be passed
into AWS CDK Constructs, and outputs from AWS CDK stacks can be used as inputs
to other Pulumi resources.

> Note: Currently, the Pulumi CDK Adapter preview is available only for
> TypeScript/JavaScript users.

For example, to construct an [AWS AppRunner `Service`
resource](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-apprunner-alpha-readme.html)
from within a Pulumi program, and export the resulting service's URL as as
Pulumi Stack Output you write the following:

```ts
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { Service, Source } from '@aws-cdk/aws-apprunner-alpha';

class AppRunnerStack extends pulumicdk.Stack {
    url: pulumi.Output<string>;

    constructor(id: string, options?: pulumicdk.StackOptions) {
        super(id, options);

        const service = new Service(this, 'service', {
            source: Source.fromEcrPublic({
                imageConfiguration: { port: 8000 },
                imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
            }),
        });

        this.url = this.asOutput(service.serviceUrl);
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new AppRunnerStack('teststack');
    return {
        url: stack.url,
    };
});
export const url = app.outputs['url'];
```

And then deploy with `pulumi update`:

```console
> pulumi up

Updating (dev)

View Live: https://app.pulumi.com/lukehoban/pulumi-cdk-apprunner/dev/updates/1

     Type                                   Name                       Status
 +   pulumi:pulumi:Stack                    pulumi-cdk-apprunner-dev   created
 +   └─ cdk:index:StackComponent            teststack                  created
 +      └─ cdk:construct:Service            teststack/adapter/service  created
 +         └─ aws-native:apprunner:Service  service6D174F83            created

Outputs:
    url: "2ez3iazupm.us-west-2.awsapprunner.com"

Resources:
    + 4 created
```

And curl the endpoint:

```console
> curl https://$(pulumi stack output url)

   ______                             __        __      __  _                  __
  / ____/___  ____  ____ __________ _/ /___  __/ /___ _/ /_(_)___  ____  _____/ /
 / /   / __ \/ __ \/ __ `/ ___/ __ `/ __/ / / / / __ `/ __/ / __ \/ __ \/ ___/ /
/ /___/ /_/ / / / / /_/ / /  / /_/ / /_/ /_/ / / /_/ / /_/ / /_/ / / / (__  )_/
\____/\____/_/ /_/\__, /_/   \__,_/\__/\__,_/_/\__,_/\__/_/\____/_/ /_/____(_)
                 /____/


        Congratulations, your service has successfully deployed on AWS App Runner.



Open it in your browser at https://2ez3iazupm.us-west-2.awsapprunner.com/

Try the workshop at https://apprunnerworkshop.com
Read the docs at https://docs.aws.amazon.com/apprunner
```

## AWS Cloud Control AutoNaming Config

Sometimes CDK constructs can create resource names that are too long for the
[AWS Cloud Control provider](https://www.pulumi.com/registry/packages/aws-native/).
When this happens you can configure the `autoTrim` feature to have the generated
names be automatically trimmed to fit within the name requirements. If you are
not configuring your own `aws-native` provider then this feature is enabled by
default. If you _are_ configuring your own `aws-native` provider then you will
have to enable this.

```ts
const nativeProvider = new aws_native.Provider('cdk-native-provider', {
  region: 'us-east-2',
  autoNaming: {
    autoTrim: true,
    randomSuffixMinLength: 7,
  },
});
const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new AppRunnerStack('teststack');
    return {
        url: stack.url,
    };
}, {
  providers: [ nativeProvider ],
});
```

## Bootstrapping

CDK has the concept of [bootstrapping](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)
which requires you to first bootstrap your account with certain AWS resources
that CDK needs to exist. With Pulumi CDK this is not required! Pulumi CDK will
automatically and dynamically create the bootstrap resources as needed.

### S3 Resources

When any file assets are added to your application, CDK will automatically
create the following staging resources.

1. [aws.s3.BucketV2](https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketv2/)
  - `forceDestroy`: true
2. [aws.s3.BucketServerSideEncryptionConfigurationV2](https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketserversideencryptionconfigurationv2/)
  - `AES256`
3. [aws.s3.BucketVersioningV2](https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketversioningv2/)
  - `Enabled`
4. [aws.s3.BucketLifecycleConfigurationV2](https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketlifecycleconfigurationv2/)
  - Expire old versions > 365 days
  - Expire deploy-time assets > 30 days
5. [aws.s3.BucketPolicy](https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketpolicy/)
  - Require SSL

### ECR Resources

When any image assets are added to your application, CDK will automatically
create the following staging resources.

1. `aws.ecr.Repository`
  - `imageTagMutability`: `IMMUTABLE`
2. `aws.ecr.LifecyclePolicy`
  - Expire old images when the number of images > 3

## API

See [API Docs](./api-docs/README.md) for more details.

## Building locally

Install dependencies, build library, and link for local usage.

```sh
$ yarn install
$ yarn build
$ yarn link
```

Run unit test:

```sh
$ yarn test

  Basic tests
    ✔ Checking single resource registration (124ms)
    ✔ Supports Output<T> (58ms)

  Graph tests
    ✔ Test sort for single resource
    ✔ Test sort for ASG example (56ms)
    ✔ Test sort for appsvc example
    ✔ Test sort for apprunner example


  6 passing (278ms)
```

Run Pulumi examples:

```
$ yarn test-examples
```
