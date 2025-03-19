#!/usr/bin/env bash

set -euo pipefail
DEP=$1

if [ -z "$DEP" ]; then
    echo "Usage: ./scripts/update-dep.sh <dependency>"
    exit 1
fi

# Update references in examples/
for e in $(find examples -name package.json | grep -v node_modules);
do
    echo "Updating $e"
    dir=$(dirname $e)
    pushd $dir
    npx ncu --filter "$DEP" --upgrade
    yarn install
    popd
done

for e in $(find integration -name package.json | grep -v node_modules);
do
    echo "Updating $e"
    dir=$(dirname $e)
    pushd $dir
    npx ncu --filter "$DEP" --upgrade
    yarn install
    popd
done
