# Agent Handoff

Welcome! To continue the CDK-to-Pulumi CLI prototype:

1. Read `spec.md` for the full implementation plan and TODO checklist.
2. Update the checklist in `spec.md` as you complete tasks.
3. Keep this file up to date if the handoff process changes.

Thanks and good luck!

## Status Updates

- Remember to commit frequently as you land logical chunks so the history stays easy to follow when handing off.
- Started carving out an intrinsic value adapter: `StackConverter` now delegates CFN attribute resolution to a pluggable adapter to pave the way for an IR implementation.
- Scaffolded the `packages/cdk-convert-core` package with its own `package.json`, tsconfig, and placeholder source; updated root TypeScript configs (`tsconfig.base.json`, `tsconfig.build.json`) plus build scripts to compile both projects.
- Moved the Pulumi-independent modules (`assembly`, `cfn`, `graph`, `sub`, `stack-map`) into `packages/cdk-convert-core` and wired imports via a new local dependency; added lightweight logging + error exports there so the runtime can keep using them.
- Added a generic `ResourceEmitter` interface in the core package and refactored `StackConverter` to use a Pulumi implementation, paving the way for an IR-based emitter.
