# Agent Handoff

Welcome! To continue the CDK-to-Pulumi CLI prototype:

1. Read `spec.md` for the full implementation plan and TODO checklist.
2. Update the checklist in `spec.md` as you complete tasks.
3. Keep this file up to date if the handoff process changes.

Thanks and good luck!

## Status Updates

- Remember to commit frequently as you land logical chunks so the history stays easy to follow when handing off.
- Started carving out an intrinsic value adapter: `StackConverter` now delegates CFN attribute resolution to a pluggable adapter to pave the way for an IR implementation.
- Added an initial `IrResourceEmitter` in the core package so StackConverter can eventually target the new IR instead of Pulumi resources.
- Scaffolded the `packages/cdk-convert-core` package with its own `package.json`, tsconfig, and placeholder source; updated root TypeScript configs (`tsconfig.base.json`, `tsconfig.build.json`) plus build scripts to compile both projects.
- Moved the Pulumi-independent modules (`assembly`, `cfn`, `graph`, `sub`, `stack-map`) into `packages/cdk-convert-core` and wired imports via a new local dependency; added lightweight logging + error exports there so the runtime can keep using them.
- Added a generic `ResourceEmitter` interface in the core package and refactored `StackConverter` to use a Pulumi implementation, paving the way for an IR-based emitter.
- Created a shared `Mapping`/`IntrinsicValueAdapter` contract plus a new `IrIntrinsicValueAdapter` in the core package; added unit tests so we can start wiring StackConverter to produce IR-friendly references next.
- Moved the naming helpers (`toSdkName`, `typeToken`, etc.) into the core package and extended the new `convertStackToIr` helpers to normalize `Ref`/`Fn::GetAtt` expressions into IR references (tests in `tests/ir`). Full intrinsic/dynamic evaluation plus StackConverter wiring still pending.
- Started converter cleanup by moving the shared `Mapping` and `IntrinsicValueAdapter` interfaces into `@pulumi/cdk-convert-core`; the runtime now consumes these exports, so future IR emitters/value adapters can plug in without touching Pulumi-specific code.
- Added a shared IR intrinsic resolver (joins/splits/conditionals/dynamic references) plus a `StackConverter.convertStacksToProgramIr` path that reuses `IrResourceEmitter`/`IrIntrinsicValueAdapter` to emit `ProgramIR` snapshots.
- Added `yaml` dep plus `src/cli/ir-to-yaml.ts` to serialize `ProgramIR` resources (name planning, options rewriting, parameter default enforcement). New Jest coverage in `tests/cli/ir-to-yaml.test.ts`. Stack outputs are intentionally deferred per backlog note in `spec.md`, and stack-output references are now inlined so cross-stack consumers point directly at the originating resource.
