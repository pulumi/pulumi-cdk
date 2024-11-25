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
Pulumi Output value into a CDK resource you can use the [asString](./api-docs/README.md#asString), [asList](./api-docs/README.md#asList), &
[asNumber](./api-docs/README.md#asNumber) functions. Conversely, in order to pass a CDK attribute to a Pulumi
resource, you can use the [Stack.asOutput](./api-docs/README.md#asOutput) function to convert the CDK resource
to a Pulumi Output value.

### CDK to Pulumi Example

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

### Pulumi to CDK Example

CDK L2 Constructs do not normally take simple values. Instead, they take
references to other L2 Constructs. If you want to take a Pulumi resource and
pass that in to a CDK Construct, you first have turn the Pulumi resource into a
reference to a CDK L2 Construct. You can do this by using `asString` in
combination with CDK `fromXXX` methods.

**Example**
```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new pulumicdk.Stack('example-stack');

    // create a Pulumi Resource
    const zone = new aws.route53.Zone('example-zone', {
      name: 'cooldomain.io',
    });

    // Turn it into a reference to a CDK L2 Construct (IHostedZone)
    const hostedZone = aws_route53.HostedZone.fromHostedZoneAttributes(
      this,
      'hosted-zone',
      {
        zoneName: asString(zone.name),
        hostedZoneId: asString(zone.zoneId),
      },
    );

    new aws_route53.CnameRecord(this, 'record', {
      zone: hostedZone, // pass it into another L2 Construct
      domainName: 'example.com',
      recordName: 'test',
    });
});

```

## Create Pulumi outputs

In order to create Pulumi [Stack outputs](https://www.pulumi.com/docs/iac/concepts/stacks/#outputs)
you also need to propagate the [App outputs](./api-docs/README.md#AppOutputs) all the way to the Pulumi Stack
outputs. You can do this in one of two ways.

**CfnOutput**

Any `CfnOutput` that you create automatically gets added to the `App outputs`.

```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    const stack = new pulumicdk.Stack('example-stack');
    const bucket = new s3.Bucket(stack, 'Bucket');
    new cdk.CfnOutput(stack, 'BucketName', { value: bucket.bucketName });
});

export const bucketName = app.outputs['BucketName'];

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
    // enable autoNaming
    autoNaming: {
        autoTrim: true,
        randomSuffixMinLength: 7,
    }
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

CDK [lookups](https://docs.aws.amazon.com/cdk/v2/guide/context.html#context_methods) are currently disabled by default.
If you would like to use lookups there are currently two options.

### Use Pulumi functions

Instead of using CDK Lookups you can use Pulumi functions along with CDK
`fromXXX` methods.

**Example**
```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new pulumicdk.Stack('example-stack');
    // use getAmiOutput to lookup the AMI instead of ec2.LookupMachineImage
    const ami = aws.ec2.getAmiOutput({
        owners: ['amazon'],
        mostRecent: true,
        filters: [
            {
                name: 'name',
                values: ['al2023-ami-2023.*.*.*.*-arm64'],
            },
        ],
    });

    const region = aws.config.requireRegion();
    const machineImage = ec2.MachineImage.genericLinux({
        [region]: pulumicdk.asString(ami.imageId),
    });

    const instance = new ec2.Instance(this, 'Instance', {
        vpc,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
        machineImage,
    });
});
```

### Experimental Lookup Support

Set the environment variable `PULUMI_CDK_EXPERIMENTAL_LOOKUPS=true`. This will
allow lookups to run during preview operations, but will require you to execute
Pulumi twice (the first execution will fail).

**Example**
```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new pulumicdk.Stack('example-stack');
    const hostedZone = aws_route53.HostedZone.fromLookup(this, 'hosted-zone', {
        domainName: zoneName,
    });

    new aws_route53.AaaaRecord(this, 'record', {
        zone: hostedZone,
        target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(lb)),
    });
});
```

```console
PULUMI_CDK_EXPERIMENTAL_LOOKUPS=true pulumi preview
```

You will see an error message that looks something like the error message below.

```console

cdk:construct:StagingStack (staging-stack):
    error: Duplicate resource URN 'urn:pulumi:project::pulumi-lookups-enabled::cdk:index:App$cdk:construct:StagingStack::staging-stack-'; try giving it a unique name
```

At this point the lookups have been performed and you should be able to run
Pulumi commands without errors.

## Using Pulumi Policy Packs

You can use [Policy
Packs](https://www.pulumi.com/docs/iac/packages-and-automation/crossguard/get-started/#get-started-with-pulumi-policy-as-code)
with your Pulumi CDK Application. It is also possible to use CDK specific policy
validation tools (a couple are discussed below), but it is recommended to use
Pulumi specific tools, especially if you are creating Pulumi resources outside
of CDK.

Below is an example output using Pulumi's [Compliance Ready Policies](https://www.pulumi.com/docs/iac/packages-and-automation/crossguard/compliance-ready-policies/)

```ts
import * as s3 from 'aws-cdk-lib/aws-s3';

const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new pulumicdk.Stack('example-stack');

    new s3.Bucket(this, 'bucket');
});
```

**Example output**
```console
Policies:
    ❌ aws-compliance-ready-policies-typescript@v0.0.1 (local: ../policypack)
        - [mandatory]  awsnative-s3-bucket-enable-server-side-encryption  (aws-native:s3:Bucket: bucket)
          Check that S3 Bucket Server-Side Encryption (SSE) is enabled.
          S3 Buckets Server-Side Encryption (SSE) should be enabled.
```

## CDK Aspects

Pulumi CDK supports CDK Aspects, including aspects like [cdk-nag](https://github.com/cdklabs/cdk-nag)

```ts
import * as s3 from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks } from 'cdk-nag';

const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new pulumicdk.Stack('example-stack');
    Aspects.of(stack).add(new AwsSolutionsChecks({ verbose: true }));

    new s3.Bucket(this, 'bucket');
});
```

**Example Output**
```console
[Error at /test-stack/bucket/Resource] AwsSolutions-S1: The S3 Bucket has server access logs disabled. The bucket should have server access logging enabled to provide detailed records for the requests that are made to the bucket.
[Error at /test-stack/bucket/Resource] AwsSolutions-S10: The S3 Bucket or bucket policy does not require requests to use SSL. You can use HTTPS (TLS) to help prevent potential attackers from eavesdropping on or manipulating network traffic using person-in-the-middle or similar attacks. You should allow only encrypted connections over HTTPS (TLS) using the aws:SecureTransport condition on Amazon S3 bucket policies.
```

## CDK Policy Validation Plugins

Pulumi CDK also supports [CDK Policy Validation Plugins](https://docs.aws.amazon.com/cdk/v2/guide/policy-validation-synthesis.html).

```ts
import { CfnGuardValidator } from '@cdklabs/cdk-validator-cfnguard';
import * as s3 from 'aws-cdk-lib/aws-s3';

const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new pulumicdk.Stack('example-stack');
    new s3.Bucket(this, 'bucket');
}, {
    appOptions: {
      props: {
        policyValidationBeta1: [new CfnGuardValidator()],
      },
    },
});
```

**Example Output**
```console
Diagnostics:
  pulumi:pulumi:Stack (pulumi-typescript-app-dev):
    Performing Policy Validations
    Validation failed. See the validation report above for details

    Validation Report
    -----------------
    ╔════════════════════════════════════╗
    ║           Plugin Report            ║
    ║   Plugin: cdk-validator-cfnguard   ║
    ║   Version: N/A                     ║
    ║   Status: failure                  ║
    ╚════════════════════════════════════╝
    (Violations)
    s3_bucket_level_public_access_prohibited_check (1 occurrences)
      Occurrences:
        - Construct Path: test-stack/bucket/Resource
        - Template Path: /private/var/folders/3b/6mr1jkqx7r797ff75k27jfjc0000gn/T/cdk.outC3dFwa/test-stack.template.json
        - Creation Stack:
        └──  test-stack (test-stack)
             │ Construct: aws-cdk-lib.Stack
             │ Library Version: 2.166.0
             │ Location: Run with '--debug' to include location info
             └──  bucket (test-stack/bucket)
                  │ Construct: aws-cdk-lib.aws_s3.Bucket
                  │ Library Version: 2.166.0
                  │ Location: Run with '--debug' to include location info
                  └──  Resource (test-stack/bucket/Resource)
                       │ Construct: aws-cdk-lib.aws_s3.CfnBucket
                       │ Library Version: 2.166.0
                       │ Location: Run with '--debug' to include location info
        - Resource ID: bucket
        - Template Locations:
          > /Resources/bucket
      Description: [CT.S3.PR.1]: Require an Amazon S3 bucket to have block public access settings configured
      How to fix: [FIX]: The parameters 'BlockPublicAcls', 'BlockPublicPolicy', 'IgnorePublicAcls', 'RestrictPublicBuckets' must be set to true under the bucket-level 'PublicAccessBlockConfiguration'.
      Rule Metadata:
        DocumentationUrl: https://github.com/cdklabs/cdk-validator-cfnguard#bundled-control-tower-rules
```

## Mapping AWS resources

Pulumi CDK automatically maps CDK resources to [AWS CCAPI](https://www.pulumi.com/registry/packages/aws-native/)
resources, but there are some resources that are not yet available in CCAPI. In
these cases it is possible to manually map the CloudFormation resource to an
[AWS Provider](https://www.pulumi.com/registry/packages/aws/) resource. A couple
of common resources have been mapped in
[aws-resource-mappings.ts](./src/aws-resource-mappings.ts) which can be used as
a reference.

### Simple mapping

```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new pulumicdk.Stack('example-stack');
}, {
    appOptions: {
        remapCloudControlResource: (logicalId, typeName, props, options): ResourceMapping | undefined => {
            if (typeName === 'AWS::ApiGatewayV2::Stage') {
                return new aws.apigatewayv2.Stage(
                    logicalId,
                    {
                        accessLogSettings: props.AccessLogSettings,
                        apiId: props.ApiId,
                        ...
                    },
                    options,
                )
            }
            return undefined;
        },
    }
});
```

### Mapping to multiple resources

Sometimes a single CloudFormation resource maps to multiple AWS Provider
resources. In these cases you should return the `logicalId` of the resource
along with the resource itself.

```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new pulumicdk.Stack('example-stack');
}, {
    appOptions: {
        remapCloudControlResource: (logicalId, typeName, props, options): ResourceMapping | undefined => {
            if (typeName === 'AWS::SQS::QueuePolicy') {
                const queues: string[] = props.queues ?? [];
                return queues.flatMap((q: string, i: number) => {
                    const id = i === 0 ? logicalId : `${logicalId}-policy-${i}`;
                    return {
                        logicalId: id,
                        resource: new aws.sqs.QueuePolicy(
                            id,
                            {
                                policy: rawProps.PolicyDocument,
                                queueUrl: q,
                            },
                            options,
                        ),
                    };
                });
            }
            return undefined;
        },
    }
});
```

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

## Feature Flags

Feature flags in Pulumi CDK work the exact same way as in AWS CDK and can be set
the same way as well (e.g. `cdk.json`). You can view the currently recommended
set of feature flags [here](https://github.com/aws/aws-cdk/blob/main/packages/aws-cdk-lib/cx-api/FEATURE_FLAGS.md#currently-recommended-cdkjson).

## Setting Pulumi options for CDK resources

You can set Pulumi resource options for CDK resources by using [Transforms](https://www.pulumi.com/docs/iac/concepts/options/transforms/).
For example, if you wanted to set `protect` on database resources you could use
a transform like this.

```ts
const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new pulumicdk.Stack('example-stack');
}, {
    transforms: [
        (args: pulumi.ResourceTransformArgs): pulumi.ResourceTransformResult => {
            if (args.type === 'aws-native:rds:DbCluster') {
                return {
                    props: args.props,
                    opts: pulumi.mergeOptions(args.opts, { protect: true }),
                };
            }
            return undefined;
        },
    ]
});
```

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

### Unsupported CloudFormation Features

- [Fn::Transform](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-transform.html)
- [Transforms](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/transform-reference.html)
- [CloudFormation helper scripts](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-helper-scripts-reference.html)
    - cfn-init
    - cfn-signal
    - cfn-get-metadata
    - cfn-hup
- ResourceAttributes
    - [CreationPolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-creationpolicy.html)
    - [Snapshot DeletionPolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html)
    - [UpdatePolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatepolicy.html)
    - [UpdateReplacePolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatereplacepolicy.html)

### Unsupported CDK Features

- Cross stack references

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

## Contributing

### Building locally

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
