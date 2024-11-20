**@pulumi/cdk** • **Docs**

***

# @pulumi/cdk

## Enumerations

### PulumiProvider

The Pulumi provider to read the schema from

#### Enumeration Members

| Enumeration Member | Value | Defined in |
| ------ | ------ | ------ |
| `AWS_NATIVE` | `"aws-native"` | [types.ts:62](https://github.com/pulumi/pulumi-cdk/blob/main/src/types.ts#L62) |

## Classes

### App

A Pulumi CDK App component. This is the entrypoint to your Pulumi CDK application.
The second argument is a callback function where all CDK resources must be created.

#### Example

```ts
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as pulumicdk from '@pulumi/cdk';

const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
  // All resources must be created within a Pulumi Stack
  const stack = new pulumicdk.Stack(scope, 'pulumi-stack');
  const bucket = new s3.Bucket(stack, 'my-bucket');
  return {
    bucket: stack.asOutput(bucket.bucketName),
  };
});

export const bucket = app.outputs['bucket'];
```

#### Extends

- `ComponentResource`\<`AppResource`\>

#### Implements

- `ICloudAssemblyDirectoryProducer`
- [`AppComponent`](README.md#appcomponent)

#### Constructors

##### new App()

> **new App**(`id`, `createFunc`, `props`?): [`App`](README.md#app)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `createFunc` | (`scope`) => `void` \| [`AppOutputs`](README.md#appoutputs) |
| `props`? | [`AppResourceOptions`](README.md#appresourceoptions) |

###### Returns

[`App`](README.md#app)

###### Overrides

`pulumi.ComponentResource<AppResource>.constructor`

###### Defined in

[stack.ts:96](https://github.com/pulumi/pulumi-cdk/blob/main/src/stack.ts#L96)

#### Properties

| Property | Modifier | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ |
| `name` | `readonly` | `string` | `undefined` | The name of the component | [stack.ts:55](https://github.com/pulumi/pulumi-cdk/blob/main/src/stack.ts#L55) |
| `outputs` | `public` | `object` | `{}` | The collection of outputs from the AWS CDK Stack represented as Pulumi Outputs. Each CfnOutput defined in the AWS CDK Stack will populate a value in the outputs. | [stack.ts:61](https://github.com/pulumi/pulumi-cdk/blob/main/src/stack.ts#L61) |

***

### Stack

A Construct that represents an AWS CDK stack deployed with Pulumi.

In order to deploy a CDK stack with Pulumi, it must derive from this class.

#### Extends

- `Stack`

#### Constructors

##### new Stack()

> **new Stack**(`app`, `name`, `options`?): [`Stack`](README.md#stack)

Create and register an AWS CDK stack deployed with Pulumi.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `app` | [`App`](README.md#app) | - |
| `name` | `string` | The _unique_ name of the resource. |
| `options`? | [`StackOptions`](README.md#stackoptions) | A bag of options that control this resource's behavior. |

###### Returns

[`Stack`](README.md#stack)

###### Overrides

`cdk.Stack.constructor`

###### Defined in

[stack.ts:261](https://github.com/pulumi/pulumi-cdk/blob/main/src/stack.ts#L261)

#### Methods

##### asOutput()

> **asOutput**\<`T`\>(`v`): `Output`\<`Unwrap`\<`T`\>\>

Convert a CDK value to a Pulumi Output.

###### Type Parameters

| Type Parameter |
| ------ |
| `T` |

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `v` | `T` | A CDK value. |

###### Returns

`Output`\<`Unwrap`\<`T`\>\>

A Pulumi Output value.

###### Defined in

[stack.ts:274](https://github.com/pulumi/pulumi-cdk/blob/main/src/stack.ts#L274)

## Interfaces

### AppComponent

AppComponent is the interface representing the Pulumi CDK App Component Resource

#### Properties

| Property | Modifier | Type | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| `name` | `readonly` | `string` | The name of the component | [types.ts:72](https://github.com/pulumi/pulumi-cdk/blob/main/src/types.ts#L72) |

***

### AppOptions

Options for creating a Pulumi CDK App Component

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `appId?` | `string` | A unique identifier for the application that the asset staging stack belongs to. This identifier will be used in the name of staging resources created for this application, and should be unique across apps. The identifier should include lowercase characters, numbers, periods (.) and dashes ('-') only and have a maximum of 17 characters. **Default** `- generated from the pulumi project and stack name` | [types.ts:25](https://github.com/pulumi/pulumi-cdk/blob/main/src/types.ts#L25) |
| `props?` | `AppProps` | Specify the CDK Stack properties to asociate with the stack. | [types.ts:12](https://github.com/pulumi/pulumi-cdk/blob/main/src/types.ts#L12) |

#### Methods

##### remapCloudControlResource()?

> `optional` **remapCloudControlResource**(`logicalId`, `typeName`, `props`, `options`): `undefined` \| [`ResourceMapping`](Namespace.interop.md#resourcemapping)

Defines a mapping to override and/or provide an implementation for a CloudFormation resource
type that is not (yet) implemented in the AWS Cloud Control API (and thus not yet available in
the Pulumi AWS Native provider). Pulumi code can override this method to provide a custom mapping
of CloudFormation elements and their properties into Pulumi CustomResources, commonly by using the
AWS Classic provider to implement the missing resource.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `logicalId` | `string` | The logical ID of the resource being mapped. |
| `typeName` | `string` | The CloudFormation type name of the resource being mapped. |
| `props` | `any` | The bag of input properties to the CloudFormation resource being mapped. |
| `options` | `ResourceOptions` | The set of Pulumi ResourceOptions to apply to the resource being mapped. |

###### Returns

`undefined` \| [`ResourceMapping`](Namespace.interop.md#resourcemapping)

An object containing one or more logical IDs mapped to Pulumi resources that must be
created to implement the mapped CloudFormation resource, or else undefined if no mapping is
implemented.

###### Defined in

[types.ts:42](https://github.com/pulumi/pulumi-cdk/blob/main/src/types.ts#L42)

***

### AppResourceOptions

Options specific to the Pulumi CDK App component.

#### Extends

- `ComponentResourceOptions`

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| `appOptions?` | [`AppOptions`](README.md#appoptions) | [types.ts:54](https://github.com/pulumi/pulumi-cdk/blob/main/src/types.ts#L54) |

***

### StackOptions

Options for creating a Pulumi CDK Stack

#### Extends

- `ComponentResourceOptions`

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `props?` | `StackProps` | The CDK Stack props | [stack.ts:227](https://github.com/pulumi/pulumi-cdk/blob/main/src/stack.ts#L227) |

## Type Aliases

### AppOutputs

> **AppOutputs**: `object`

#### Index Signature

 \[`outputId`: `string`\]: `pulumi.Output`\<`any`\>

#### Defined in

[stack.ts:24](https://github.com/pulumi/pulumi-cdk/blob/main/src/stack.ts#L24)

## Functions

### asList()

> **asList**(`o`): `string`[]

Convert a Pulumi Output to a list of CDK string values.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `o` | `Output`\<`string`[]\> | A Pulumi Output value which represents a list of strings. |

#### Returns

`string`[]

A CDK token representing a list of string values.

#### Defined in

[output.ts:45](https://github.com/pulumi/pulumi-cdk/blob/main/src/output.ts#L45)

***

### asNumber()

> **asNumber**(`o`): `number`

Convert a Pulumi Output to a CDK number value.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `o` | `OutputInstance`\<`number`\> | A Pulumi Output value which represents a number. |

#### Returns

`number`

A CDK token representing a number value.

#### Defined in

[output.ts:35](https://github.com/pulumi/pulumi-cdk/blob/main/src/output.ts#L35)

***

### asString()

> **asString**(`o`): `string`

Convert a Pulumi Output to a CDK string value.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `o` | `Output`\<`string`\> | A Pulumi Output value which represents a string. |

#### Returns

`string`

A CDK token representing a string value.

#### Defined in

[output.ts:25](https://github.com/pulumi/pulumi-cdk/blob/main/src/output.ts#L25)

## Namespaces

- [interop](Namespace.interop.md)
- [synthesizer](Namespace.synthesizer.md)
