#!/usr/bin/env bash

set -euo pipefail

# Update references in examples/
for e in $(find examples -name package.json | grep -v node_modules);
do
    echo "Updating $e"
    dir=$(dirname $e)
    npx ncu --filter @pulumi/aws-native --upgrade --cwd $dir
done

for e in $(find integration -name package.json | grep -v node_modules);
do
    echo "Updating $e"
    dir=$(dirname $e)
    npx ncu --filter @pulumi/aws-native --upgrade --cwd $dir
done

echo "Updating ./package.json"
npx ncu --filter @pulumi/aws-native --upgrade
yarn install

VERSION=$(cat package.json | jq -r '.devDependencies["@pulumi/aws-native"]')

echo "Updating metadata.json"
curl -L  https://raw.githubusercontent.com/pulumi/pulumi-aws-native/refs/tags/v$VERSION/provider/cmd/pulumi-resource-aws-native/metadata.json -o schemas/aws-native-metadata.json
