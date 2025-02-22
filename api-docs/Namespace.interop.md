[**@pulumi/cdk**](README.md) • **Docs**

***

[@pulumi/cdk](README.md) / interop

# interop

## Type Aliases

### ResourceAttributeMapping

> **ResourceAttributeMapping**: `object`

Use this type if you need to control the attributes that are available on the
mapped resource. For example if the CFN resource has an attribute called `resourceArn` and
the mapped resource only has an attribute called `arn` you can return the extra `resourceArn`
attribute

#### Type declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `attributes`? | `object` | [interop.ts:78](https://github.com/pulumi/pulumi-cdk/blob/main/src/interop.ts#L78) |
| `resource` | `pulumi.Resource` | [interop.ts:77](https://github.com/pulumi/pulumi-cdk/blob/main/src/interop.ts#L77) |

#### Example

```ts
return {
  resource: mappedResource,
  attributes: {
    resourceArn: mappedResource.arn,
  }
}
```

#### Defined in

[interop.ts:76](https://github.com/pulumi/pulumi-cdk/blob/main/src/interop.ts#L76)

***

### ResourceAttributeMappingArray

> **ResourceAttributeMappingArray**: [`ResourceAttributeMapping`](Namespace.interop.md#resourceattributemapping) & `object`[]

Use this type if a single CFN resource maps to multiple AWS resources

#### Defined in

[interop.ts:84](https://github.com/pulumi/pulumi-cdk/blob/main/src/interop.ts#L84)

***

### ResourceMapping

> **ResourceMapping**: [`ResourceAttributeMapping`](Namespace.interop.md#resourceattributemapping) \| `pulumi.Resource` \| [`ResourceAttributeMappingArray`](Namespace.interop.md#resourceattributemappingarray)

#### Defined in

[interop.ts:86](https://github.com/pulumi/pulumi-cdk/blob/main/src/interop.ts#L86)

## Functions

### normalize()

> **normalize**(`value`, `cfnType`?, `pulumiProvider`?): `any`

normalize will take the resource properties for a specific CloudFormation resource and
will covert those properties to be compatible with Pulumi properties.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `any` | The resource properties to be normalized |
| `cfnType`? | `string` | The CloudFormation resource type being normalized (e.g. AWS::S3::Bucket). If no value is provided then property conversion will be done without schema knowledge |
| `pulumiProvider`? | `PulumiProvider` | The pulumi provider to read the schema from. If `cfnType` is provided then this defaults to PulumiProvider.AWS_NATIVE |

#### Returns

`any`

The normalized resource properties

#### Defined in

[interop.ts:31](https://github.com/pulumi/pulumi-cdk/blob/main/src/interop.ts#L31)
