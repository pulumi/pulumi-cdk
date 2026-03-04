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
- `yarn run test:fast`
- `yarn run verify`

## Longer-running validation
- `yarn run test-examples` for acceptance/integration behavior

## Test depth guidance
| Level | Command | When to run |
|---|---|---|
| Unit | `yarn run test` | All code changes |
| Fast smoke | `yarn run test:fast` | Tight local iteration |
| Acceptance | `yarn run test-examples` | Example/integration behavior changes |

## Code style
- Prettier configuration lives in `.prettierrc`.
- ESLint configuration lives in `.eslintrc.js`.
- Use check commands in CI (`format:check`, `lint:check`) and explicit fix commands locally when needed.

## Regeneration and drift
- `make renovate` refreshes `schemas/aws-native-metadata.json` using the pinned `@pulumi/aws-native` version.
- Generated artifacts should not be hand edited (`schemas/aws-native-metadata.json`, `api-docs/` output).

## Pull requests
Use `.github/PULL_REQUEST_TEMPLATE.md` and include exact command output for validation.
Include compatibility impact, risk/blast radius, and rollback notes for non-trivial changes.
