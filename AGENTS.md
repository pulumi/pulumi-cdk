# Agent Instructions

## What this repo is
`@pulumi/cdk` is a TypeScript SDK that lets Pulumi programs use AWS CDK constructs.

## Start here
- `src/index.ts`: public API exports
- `src/stack.ts`, `src/synthesizer.ts`: core runtime behavior
- `src/converters/`: CDK-to-Pulumi conversion logic
- `tests/`: Jest tests for TypeScript behavior
- `examples/`, `integration/`: Go-based acceptance suites
- `schemas/aws-native-metadata.json`: generated metadata, not hand-edited

## Command canon
- Install deps: `yarn install --frozen-lockfile`
- Build (compile only): `yarn run build`
- Build (full local, may write): `yarn run build:full`
- Build (CI/check): `yarn run build:ci`
- Lint (check): `yarn run lint:check`
- Lint (fix): `yarn run lint:fix`
- Format (check): `yarn run format:check`
- Format (write): `yarn run format`
- Unit tests: `yarn run test`
- Fast unit tests: `yarn run test:fast`
- Update snapshots: `yarn run test:update-snapshots`
- Quick verify: `yarn run verify`
- Makefile surface: `make help`
- Example/integration tests: `yarn run test-examples`

## Key invariants
- Keep `package.json` version placeholder `${VERSION}` for release automation.
- Do not hand-edit `schemas/aws-native-metadata.json`; update through `make renovate`.
- Treat exports in `src/index.ts` as semver-sensitive public API.

## Forbidden actions
- Do not run destructive git commands (`reset --hard`, force push) without approval.
- Do not claim tests passed without running them.
- Do not commit unrelated formatting churn.

## Escalate when
- Public API exports change (`src/index.ts`).
- Schema/mapping behavior changes (`schemas/`, `src/*resource-mappings*`).
- CI and local behavior diverge after using command canon.

## If you change...
- `src/**/*.ts`: run `yarn run verify`
- `tests/**`: run `yarn run test`
- `examples/**` or `integration/**`: run `yarn run test-examples`
- `package.json`: run `yarn install --frozen-lockfile` and verify lockfile
