# schemas

## aws-native-metadata.json

This is a copy of [pulumi-aws-native](https://github.com/pulumi/pulumi-aws-native) provider metadata. This metadata is used by `pulumi-cdk` for a few purposes:

- understand which CF resources are supported
- compute correct token mappings
- correct property names translation

The [schema](https://github.com/pulumi/pulumi-aws-native/blob/6f526ba0febe60ef834dea9b498f80dcc595cc87/provider/pkg/metadata/metadata.go#L11) of the data is defined in Go. It is similar [Pulumi package schema](https://www.pulumi.com/docs/iac/packages-and-automation/pulumi-packages/schema/) and borrows some of the grammar elements, but defines its own elements as well such as CfType that are specific to the Cloud Control to Pulumi mapping.
