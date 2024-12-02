# Used as a postUpgradeTask by Renovate. See ./renovate.json5.
.PHONY: renovate
renovate:
	VERSION=$(shell cat package.json | jq -r '.devDependencies["@pulumi/aws-native"]'); \
	curl -L https://raw.githubusercontent.com/pulumi/pulumi-aws-native/refs/tags/v$${VERSION}/provider/cmd/pulumi-resource-aws-native/metadata.json -o schemas/aws-native-metadata.json

