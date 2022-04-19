# Pulumi CDK Adapter (preview)

The Pulumi CDK Adapter is a library that enables [Pulumi](https://github.com/pulumi/pulumi) programs to use [AWS CDK](https://github.com/aws/aws-cdk) constructs. 

The adpater allows writing AWS CDK code as part of an AWS CDK Stack inside a Pulumi program, and having the resulting AWS resources be deployed and managed via Pulumi.  Outputs of resources defined in a Pulumi program can be passed into AWS CDK constructs, and outputs from AWS CDK stacks can be used as inputs to other Pulumi resources. 

> Note: Currently, the Pulumi CDK Adapter preview is available only for TypeScript/JavaScript users.

For example, to construct an [AWS AppRunner `Service` resource](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-apprunner-alpha-readme.html) from within a Pulumi program, and export the resulting service's URL as as Pulumi Stack Output you write the following:

```ts
import * as pulumicdk from '@pulumi/cdk';
import { Construct } from 'constructs';
import { Service, Source } from '@aws-cdk/aws-apprunner-alpha';
import { CfnOutput, Stack } from 'aws-cdk-lib';

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

const stack = new pulumicdk.Stack('teststack', AppRunnerStack);
export const url = stack.outputs['url'];
```

And then deloy with `pulumi update`:

```
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

```
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

## Getting Started 

Coming soon!

## API

### `Stack`

A Pulumi Component that represents an AWS CDK stack deployed with Pulumi.

#### `constructor`

Create and register an AWS CDK stack deployed with Pulumi.

```ts
constructor(name: string, stack: typeof cdk.Stack, options?: StackOptions)
```

Parameters:
* `name`: The _unique_ name of the resource.
* `stack`: The CDK Stack subclass to create.
* `options`: A bag of options that control this resource's behavior.

#### `outputs`

The collection of outputs from the AWS CDK Stack represented as Pulumi Outputs. Each `CfnOutput` defined in the AWS CDK Stack will populate a value in the outputs.

```ts
outputs: { [outputId: string]: pulumi.Output<any> }
```

### `StackOptions`

Options specific to the Stack component.

```ts
interface StackOptions
```

#### `remapCloudControlResource`

This optional method can be implemented to define a mapping to override and/or provide an implementation for a CloudFormation resource type that is not (yet) implemented in the AWS Cloud Control API (and thus not yet available in the Pulumi AWS Native provider). Pulumi code can override this method to provide a custom mapping of CloudFormation elements and their properties into Pulumi CustomResources, commonly by using the AWS Classic provider to implement the missing resource.

```ts
remapCloudControlResource(element: CfnElement, logicalId: string, typeName: string, props: any, options: pulumi.ResourceOptions): { [key: string]: pulumi.CustomResource } | undefined
```

Parameters:
* `element`: The full CloudFormation element object being mapped.
* `logicalId`: The logical ID of the resource being mapped.
* `typeName`: The CloudFormation type name of the resource being mapped.
* `props`: The bag of input properties to the CloudFormation resource being mapped.
* `options`: The set of Pulumi ResourceOptions to apply to the resource being mapped.

Returns an object containing one or more logical IDs mapped to Pulumi resources that must be created to implement the mapped CloudFormation resource, or else undefined if no mapping is implemented.

#### `create`

Create and register an AWS CDK stack deployed with Pulumi.

```ts
create(name: string, ctor: typeof Stack, opts?: pulumi.CustomResourceOptions): StackComponent
```

Parameters:
* `name`: The _unique_ name of the resource.
* `stack`: The CDK Stack subclass to create.
* `parent`: The Pulumi CDKStackComponent parent resource.
* `opts`: A bag of options that control this resource's behavior.

### `asString`

Convert a Pulumi Output to a CDK string value.

```ts
function asString<T>(o: pulumi.Output<T>): string
```

Parameters:
 * `o`: A Pulumi Output value which represents a string.

Returns A CDK token representing a string value.

### `asNumber`

Convert a Pulumi Output to a CDK number value.

```ts
function asNumber<T>(o: pulumi.Output<T>): number
```

Parameters:
 * `o`: A Pulumi Output value which represents a number.

Returns A CDK token representing a number value.

### `asList`

Convert a Pulumi Output to a list of CDK values.

```ts
function asList<T>(o: pulumi.Output<T>): string[]
```

Parameters:
 * `o`: A Pulumi Output value which represents a list.

Returns a CDK token representing a list of values.

## Building locally

Install dependenices, build library, and link for local usage.

```sh
$ yarn install
$ yarn build
$ pushd lib && yarn link && popd
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


