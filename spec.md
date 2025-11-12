# Pulumi CDK Conversion CLI – Implementation Plan

## Goal
Prototype a reusable conversion pipeline that can take an existing AWS CDK application, synthesize it, convert the resulting CloudFormation templates into Pulumi resource definitions, and emit Pulumi YAML. The prototype should live inside this repo and be usable both as a library and via a CLI entrypoint.

## Current State Summary
- `src/stack.ts` builds and executes CDK apps inside Pulumi, then instantiates Pulumi resources via `AppConverter`/`StackConverter`.
- Conversion logic (assembly reading, graph building, intrinsic resolution, resource mapping) already exists but is tightly coupled to Pulumi runtime objects.
- No standalone tool exists to run the conversion outside a Pulumi program or export YAML.

## Approach
1. Extract the reusable conversion logic into an internal package (e.g., `packages/cdk-convert-core`). This package should operate solely on Cloud Assembly artifacts and return a neutral intermediate representation (IR) for resources/outputs.
2. Keep existing Pulumi integration by adapting `StackConverter` to target either real Pulumi resources (current behavior) or the new IR, so the same algorithms are shared.
3. Build a CLI (`bin/cdk-to-pulumi`) that runs a CDK app (or consumes a pre-built assembly), invokes the core library, and writes Pulumi YAML.
4. Leave room for future extraction into its own repo by keeping the package API narrow and documented.

## Detailed TODOs

### Package Extraction
- [x] Create `packages/cdk-convert-core` with its own `package.json`, tsconfig, and build outputs.
- [ ] Move/rewire modules that do not depend on Pulumi runtime (`assembly`, `graph`, `cfn*`, `sub`, `stack-map`, converters minus Pulumi-specific bits) into the package.
  - `assembly`, `cfn`, `graph`, `sub`, and `stack-map` now live under `packages/cdk-convert-core`; converter cleanup underway (shared Mapping/intrinsic value adapter interfaces now exported from the core package to prep IR work).
- [x] Introduce an explicit interface (e.g., `ResourceEmitter`) that `StackConverter` uses to emit resources so we can provide multiple implementations.
- [ ] Ensure existing code under `src/` re-exports the package where necessary so current imports continue working.

### Intermediate Representation (IR)
- [x] Define TypeScript types for the neutral resource description (type token, logical ID, inputs, options such as dependsOn/parent/retain).
- [x] Introduce an intrinsic/value adapter so `StackConverter` can resolve expressions into either Pulumi Outputs or IR-safe reference objects.
  - `IrIntrinsicValueAdapter` now powers the shared `IrIntrinsicResolver`, which rewrites `Ref`/`Fn::*` expressions into IR-friendly values for both the standalone converter and the new StackConverter IR mode.
- [x] Teach `StackConverter` to populate the IR via the new emitter instead of directly instantiating Pulumi resources when requested.
  - Added a reusable path that calls `convertStackToIr` with `IrResourceEmitter`/`IrIntrinsicValueAdapter`, so stack manifests can produce `ProgramIR` snapshots without registering Pulumi resources.
- [x] Add support for stack outputs and parameters in the IR so the CLI can emit them as Pulumi stack outputs/config.
  - Outputs and parameter defaults now flow through the resolver, so joins/splits/conditionals/dynamic references are normalized before landing in `StackIR`.

### CLI Prototype
- [ ] Add a new executable under `bin/` (wired via `package.json#bin`) named `cdk-to-pulumi`.
- [ ] CLI responsibilities:
  - Accept either `--cdk-app <cmd>` (run CDK synth) or `--assembly <path>`.
  - When running the app, reuse existing `AwsCdkCli` helper/synthesizer logic if possible; otherwise shell out to `cdk synth`.
  - Invoke the core converter to get the IR.
  - Serialize the IR to Pulumi YAML (resources + outputs) in an output file/folder.
- [ ] Provide minimal documentation (`README` section) describing usage of the CLI.

### Pulumi Runtime Integration
- [ ] Update the existing Pulumi adapter (`src/stack.ts` etc.) to import the shared package and use the Pulumi-specific `ResourceEmitter`, eliminating duplicate logic.
- [ ] Validate that existing tests/examples still pass.

### Testing & Validation
- [ ] Add unit tests for the new package covering manifest parsing, IR emission, and CLI serialization paths.
- [ ] Add an integration test that runs the CLI against one of the samples in `examples/` and asserts on the generated YAML snapshot.

### Developer Experience
- [ ] Document repo structure changes and the new workflow in `AGENTS.md` (see instructions there).
- [ ] Note any follow-up tasks (e.g., extraction into its own repo, GA features, additional resource mappers).

## Notes & Risks
- Asset handling currently uploads files via Pulumi resources. For the CLI prototype, decide whether to skip uploads (preferable) or stub them out. Document the chosen approach.
- Intrinsic evaluation depends on Pulumi `Output` helpers (`lift`). For CLI use, implement a synchronous version or wrap the existing helpers in a shim that resolves to plain JS values before YAML emission.
- Nested stacks and custom resources must still be supported; ensure IR captures enough information to preserve dependencies/order.

## Open Questions
1. Do we need to support arbitrary CDK context lookups for the CLI prototype, or can we require users to pre-populate `cdk.context.json`?
2. Should the CLI emit a single YAML program per stack or combine multiple stacks into one Pulumi project?
3. How should we surface assets (file paths, Docker images) in YAML when uploads are skipped?

Track updates to this plan in `AGENTS.md` so future agents know where to continue.
