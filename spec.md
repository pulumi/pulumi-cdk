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

## Bun Executable Builds
- Install [Bun](https://bun.sh) locally and run `npm run build:bun-cli` to emit a standalone binary at `dist/bin/cdk-to-pulumi` (the script enables `--minify` and `--sourcemap` by default).
- Pass additional Bun flags via `npm run build:bun-cli -- --target=bun-linux-x64` to cross-compile; run the script multiple times to produce binaries for each platform you care about.
- These binaries embed the Bun runtime; keep using the Node-based workflow for local development/tests and reserve Bun builds for packaging/distribution experiments.

## Detailed TODOs

### Package Extraction
- [x] Create `packages/cdk-convert-core` with its own `package.json`, tsconfig, and build outputs.
- [x] Move/rewire modules that do not depend on Pulumi runtime (`assembly`, `graph`, `cfn*`, `sub`, `stack-map`, converters minus Pulumi-specific bits) into the package.
  - `assembly`, `cfn`, `graph`, `sub`, and `stack-map` now live under `packages/cdk-convert-core`; converter cleanup underway (shared Mapping/intrinsic value adapter interfaces now exported from the core package to prep IR work).
- [x] Introduce an explicit interface (e.g., `ResourceEmitter`) that `StackConverter` uses to emit resources so we can provide multiple implementations.
- [x] Ensure existing code under `src/` re-exports the package where necessary so current imports continue working.

### Intermediate Representation (IR)
- [x] Define TypeScript types for the neutral resource description (type token, logical ID, inputs, options such as dependsOn/parent/retain).
- [x] Introduce an intrinsic/value adapter so `StackConverter` can resolve expressions into either Pulumi Outputs or IR-safe reference objects.
  - `IrIntrinsicValueAdapter` now powers the shared `IrIntrinsicResolver`, which rewrites `Ref`/`Fn::*` expressions into IR-friendly values for both the standalone converter and the new StackConverter IR mode.
- [x] Teach `StackConverter` to populate the IR via the new emitter instead of directly instantiating Pulumi resources when requested.
  - Added a reusable path that calls `convertStackToIr` with `IrResourceEmitter`/`IrIntrinsicValueAdapter`, so stack manifests can produce `ProgramIR` snapshots without registering Pulumi resources.
- [x] Add support for stack outputs and parameters in the IR so the CLI can emit them as Pulumi stack outputs/config.
  - Outputs and parameter defaults now flow through the resolver, so joins/splits/conditionals/dynamic references are normalized before landing in `StackIR`.

### CLI Prototype
- [x] Add a new executable under `bin/` (wired via `package.json#bin`) named `cdk-to-pulumi`.
- [x] Expose a helper that loads a Cloud Assembly via `AssemblyManifestReader`, feeds each stack through `convertStackToIr`, and returns a combined `ProgramIR` so both the CLI and runtime can share it.
- [x] CLI responsibilities (initial prototype):
  - [x] Accept `--assembly <path>` that points at an already-synthesized `cdk.out`. Defer `--cdk-app`/`cdk synth` orchestration until later.
  - [x] Invoke the new assembly-to-IR helper to get the `ProgramIR`.
  - [x] Serialize all stacks into a single Pulumi YAML program (resources + outputs) written to an output file/folder.
- [x] Add a serializer module (e.g., `src/cli/ir-to-yaml.ts`) that converts `ProgramIR` into Pulumi YAML using the `yaml` npm package.
    - [x] Ensure resource names are unique/stable by deriving them from `stackPath` + `logicalId`, keeping a lookup so cross-resource references can be rewritten.
    - [x] Implement intrinsic/value conversions in YAML serialization:
      - [x] primitives/maps/arrays map directly
      - [x] `ConcatValue` → `fn::join`
      - [x] `DynamicReferenceValue` → `fn::invoke` (`aws-native:ssm/getParameter`, `aws-native:secretsmanager/getSecretValue`, etc.)
      - [x] `ResourceAttributeReference` → `${resourceName.property}` using `attributePropertyName`/`cfRef` metadata for property names
      - [x] `StackOutputReference` → flattened to the referenced `PropertyValue` so cross-stack consumers interpolate the source resource directly (top-level Pulumi outputs are backlogged)
      - [x] `ParameterReference` → parameter defaults (error if missing)
      - [x] surface an explicit error for intrinsics we can’t yet represent
- [x] Add serializer-focused unit tests that exercise resource naming, options rewriting, intrinsic conversions, and error paths.
- [ ] Provide minimal documentation (`README` section) describing usage of the CLI and the current assumptions (pre-built assembly, single YAML output).

#### Serializer Module Detail

- [x] **Module Skeleton**
  - [x] Create `src/cli/ir-to-yaml.ts` exporting `serializeProgramIr(program: ProgramIR): string`.
  - [x] Add the `yaml` npm dependency and wire any necessary build/test plumbing.
- [x] **Resource Name Planner**
  - [x] Implement deterministic name derivation from `stackPath` + `logicalId` (slugify + dedupe).
  - [x] Maintain a lookup table so other serializer stages can resolve references.
- [ ] **Program Writer**
  - [x] Translate each `ResourceIR` into a Pulumi YAML resource block, including options (`dependsOn` → resource names, `retainOnDelete` → `protect`).
  - [ ] Emit stack outputs as top-level Pulumi outputs with stable names and ensure cross-stack references surface correctly. _(Backlog per latest handoff; serializer currently skips outputs entirely.)_
  - [x] Enforce parameter defaults during serialization (fail fast if a parameter is referenced without a default).
- [ ] **Property Value Converters**
  - [x] Primitive/map/array passthrough.
  - [x] `ConcatValue` → `fn::join`.
  - [x] `DynamicReferenceValue` → `fn::invoke` with service-specific functions.
  - [x] `ResourceAttributeReference` → `${resourceName.property}` using attribute metadata; `StackOutputReference` is flattened before serialization so cross-stack references point straight at resources; `ParameterReference` → default value.
  - [x] Explicit error for unsupported intrinsics to keep behavior predictable.
- [x] **Testing**
- [x] Add focused serializer unit tests covering naming, dependsOn/protect options, each property value variant, and missing parameter default errors.

### Intrinsic Resolver Parity
- [x] `Fn::Sub` – parse template segments and re-emit as concatenations so YAML never surfaces reserved `fn::` prefixes.
- [x] `Fn::Select` – resolve positional lookups over resolved arrays.
- [x] `Fn::Base64` – evaluate payloads via Node Buffer equivalent.
- [x] `Fn::FindInMap` – reuse StackConverter logic to pull values from template mappings.
- [x] `Fn::ImportValue` – throw with a descriptive error until we wire export resolution.
- [x] `Fn::Transform` – throw (macros unsupported).
- [x] `Fn::Cidr` – throw unsupported for now (needs AWS-native helper parity).
- [x] `Fn::GetAZs` – throw unsupported for now (needs AWS-native helper parity).
- [x] `Ref` parity – use cfRef metadata (or fall back to `.id`) so IR/YAML references match Pulumi runtime behavior.

### Pulumi Runtime Integration
- [ ] **Unify Stack conversion paths** – Refactor `StackConverter` to call `convertStackToIr` for every stack (even when running inside Pulumi) by providing a Pulumi-flavored `IntrinsicValueAdapter`/`ResourceEmitter`. The emitter should translate `StackAddress` references in `IrResourceOptions` into actual Pulumi dependencies/parents, while the adapter converts resolved `PropertyValue` structures (refs, dynamic references, parameters) into `pulumi.Input` values using the runtime `Mapping` tables.
- [ ] **Bridge nested-stack + parameter handling** – Replace the bespoke `processIntrinsics`/`IntrinsicContext` logic with helpers that consume the IR output. Ensure nested stack parameters, stack outputs, and `OutputMap` wiring continue to function by feeding IR-evaluated parameter defaults and outputs back into the existing `StackMap` structures.
- [ ] **Remove legacy intrinsic implementation** – After the runtime successfully emits resources from IR, delete `src/converters/intrinsics.ts`, `processIntrinsics`, and other now-redundant evaluators. Port the relevant tests to exercise the shared IR resolver (e.g., reuse `tests/ir/intrinsic-resolver.test.ts` plus a Pulumi integration test that provisions a representative stack via the runtime).
- [ ] **Regression testing** – Re-run the current unit/integration suites plus at least one end-to-end example (`examples/simple/` or similar) to verify both the CLI and `@pulumi/cdk` paths keep emitting identical resource graphs.

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
