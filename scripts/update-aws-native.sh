#!/usr/bin/env bash

set -euo pipefail

# Require that VERSION environment variable is set
if [ -z "${VERSION}" ]; then
  echo "VERSION environment variable is required to set the desired pulumi-aws-native version (no v prefix)"
  exit 1
fi

# Update references in examples/
for e in $(find examples -name package.json | grep -v node_modules);
do
    echo "Updating $e"
    (cd $(dirname $e) && yarn install)
    (cd $(dirname $e) && yarn upgrade "@pulumi/aws-native@^${VERSION}")
done

for e in $(find integration -name package.json | grep -v node_modules);
do
    echo "Updating $e"
    (cd $(dirname $e) && yarn install)
    (cd $(dirname $e) && yarn upgrade "@pulumi/aws-native@^${VERSION}")
done

echo "Updating ./package.json"
yarn install
yarn upgrade "@pulumi/aws-native@^${VERSION}"
