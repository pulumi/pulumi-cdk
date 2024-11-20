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

## Use Pulumi resources with CDK Constructs

It is possible to use Pulumi and CDK resources side-by-side. In order to pass a
Pulumi Output value into a CDK resource you can use the [asString][./api-docs/README.md#asString], [asList][./api-docs/README.md#asList], &
[asNumber](./api-docs/README.md#asNumber) functions. Conversely, in order to pass a CDK attribute to a Pulumi
resource, you can use the [Stack.asOutput](./api-docs/README.md#asOutput) function to convert the CDK resource
to a Pulumi Output value.

### Example

```ts
import * as pulumicdk from '@pulumi/cdk';
import * as aws from '@pulumi/aws';
import * as s3ObjectLambda from 'aws-cdk-lib/aws-s3objectlambda';
import * as s3 from 'aws-cdk-lib/aws-s3';

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new pulumicdk.Stack('accesspoint-stack');
    const bucket = new s3.Bucket(stack, 'example-bucket');

    const policyDoc = new iam.PolicyDocument();
    policyDoc.addStatements(...);

    const ap = new aws.s3.AccessPoint('exampleBucketAP', {
      // Use `asOutput` to convert the bucketName attribute to a Pulumi Output
      bucket: stack.asOutput(bucket.bucketName),
      name: S3_ACCESS_POINT_NAME,
      policy: policyDoc.toJSON(),
    }, { parent: scope });

    const objectLambdaAP = new s3ObjectLambda.CfnAccessPoint(stack, 's3ObjectLambdaAP', {
      name: OBJECT_LAMBDA_ACCESS_POINT_NAME,
        objectLambdaConfiguration: {
          // Use `asString` to convert a Pulumi Output to a string value
          supportingAccessPoint: pulumicdk.asString(ap.arn),
          transformationConfigurations: [...],
        },
    });
});
```

### L2 Example

You can also use `asString` in combination with CDK `fromXXX` methods to up cast
to the L2.

```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new pulumicdk.Stack('example-stack');
    const zone = new aws.route53.Zone('example-zone', {
      name: 'cooldomain.io',
    });

    const hostedZone = aws_route53.HostedZone.fromHostedZoneAttributes(
      this,
      'hosted-zone',
      {
        zoneName: asString(zone.name),
        hostedZoneId: asString(zone.zoneId),
      },
    );

    new aws_route53.CnameRecord(this, 'record', {
      zone: hostedZone,
      domainName: 'example.com',
      recordName: 'test',
    });
});

```

## Create Pulumi outputs

In order to create Pulumi [Stack outputs](https://www.pulumi.com/docs/iac/concepts/stacks/#outputs)
you have to add the outputs to the [App outputs](./api-docs/README.md#AppOutputs). You can do this
in one of two ways.

**CfnOutput**

Any `CfnOutput` that you create automatically gets added to the `App outputs`.

```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new pulumicdk.Stack('example-stack');
    const bucket = new s3.Bucket(stack, 'Bucket');
    new cdk.CfnOutput(stack, 'BucketName', { value: bucket.bucketName });
});

export const bucketName = app.outputs['bucketName'];

```

**AppOutputs**

```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new pulumicdk.Stack('example-stack');
    const bucket = new s3.Bucket(stack, 'Bucket');
    return {
        bucketName: stack.asOutput(bucket.bucketName),
    }
});

export const bucketName = app.outputs['bucketName'];

```

## Customizing providers

Currently Pulumi CDK utilizes three Pulumi providers.

1. [AWS Provider](https://www.pulumi.com/registry/packages/aws/)
2. [AWS Cloud Control Provider](https://www.pulumi.com/registry/packages/aws-native/)
3. [Docker Build Provider](https://www.pulumi.com/registry/packages/docker-build/)

If you want to customize any of these providers you can create your own and pass
them to the [AppResourceOptions](./api-docs/README.md#AppResourceOptions)

```ts
import * as pulumicdk from '@pulumi/cdk';
import * as aws from '@pulumi/aws';
import * as ccapi from '@pulumi/aws-native';
import * as build from '@pulumi/docker-build';

const awsProvider = new aws.Provider('aws-provider');
const awsCCAPIProvider = new ccapi.Provider('ccapi-provider', {
    region: 'us-east-2',
});
const dockerBuildProvider = new build.Provider('docker-build');

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new pulumicdk.Stack('example-stack');
    const bucket = new s3.Bucket(stack, 'Bucket');
}, {
    providers: [
      dockerBuildProvider,
      awsProvider,
      awsCCAPIProvider,
    ]
});
```

## CDK Lookups

## CDK Aspects

## CDK Policy Validation Plugins

## Mapping AWS resources

## Using Assets

### Docker Assets

In order to use Docker assets with Pulumi CDK you have to provide the `assetName` when
you create the asset. This is because Pulumi CDK will automatically create a ECR
Repository per image asset.

```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new pulumicdk.Stack('example-stack');

    const vpc = new ec2.Vpc(stack, 'MyVpc');
    const cluster = new ecs.Cluster(stack, 'fargate-service-autoscaling', { vpc });

    // Create Fargate Service
    const fargateService = new ecs_patterns.NetworkLoadBalancedFargateService(this, 'sample-app', {
        cluster,
        taskImageOptions: {
            image: ecs.ContainerImage.fromAsset(path.join(__dirname, './'), {
                // assetName is now required and is used in the name of the ecr repository that is created
                assetName: 'cdk-fargate-example',
            }),
        },
    });
});
```

## Context values

## Feature Flags

## Setting Pulumi options for CDK resources

## Pulumi Synthesizer

By default Pulumi CDK uses a custom [PulumiSynthesizer](./api-docs/Namespace.synthesizer.md).
One of the things a CDK [Synthesizer](https://docs.aws.amazon.com/cdk/v2/guide/configure-synth.html) is
used for is registering assets. The `PulumiSynthesizer` handles automatically
provisioning the required resources (see [Bootstrapping](#bootstrapping)) and
uploading File and Image assets.

In order to customize the settings, you can pass in a `PulumiSynthesizer` that
you create.

```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new pulumicdk.Stack('example-stack');
    const bucket = new s3.Bucket(stack, 'Bucket');
}, {
  appOptions: {
    props: {
      defaultStackSynthesizer: new PulumiSynthesizer({
        appId: `cdk-${pulumi.getStack()}`,
        autoDeleteStagingAssets: false,
      })
    }
  }
});
```

## Unsupported Features

### Cross stack references


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
