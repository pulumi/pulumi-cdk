# Contributing

Thanks for contributing to `@pulumi/cdk`.

## Prerequisites
- Node, Yarn, Go, and Pulumi CLI (see `mise.toml` for pinned versions)

## Setup
```sh
yarn install --frozen-lockfile
```

## Development workflow
1. Make the smallest scoped change possible.
2. Add or update tests near behavior changes.
3. Run validation before opening a PR.

## Validation commands
- `yarn run format:check`
- `yarn run lint:check`
- `yarn run test`
- `yarn run verify`

## Longer-running validation
- `yarn run test-examples` for acceptance/integration behavior

## Regeneration and drift
- `make renovate` refreshes `schemas/aws-native-metadata.json` using the pinned `@pulumi/aws-native` version.
- Avoid hand editing generated artifacts.

## Pull requests
Use `.github/PULL_REQUEST_TEMPLATE.md` and include exact command output for validation.
