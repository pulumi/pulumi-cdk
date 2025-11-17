# Intrinsic Handling Pipeline

This document explains how the convert-core package resolves CloudFormation intrinsics and how the resulting data flows into the Pulumi YAML output. It also outlines what needs to change when support for a new intrinsic is added.

## High-level Flow

1. **Stack conversion** – `convertStackToIr` wires together the intrinsic resolver, the intrinsic value adapter, and the resource emitter (`src/ir/stack-converter.ts`). Every CloudFormation template passes through this stage before anything Pulumi-specific happens.
2. **Intrinsic resolution** – `IrIntrinsicResolver` recursively walks every property/output/parameter, folds supported CloudFormation intrinsics, and produces `PropertyValue` nodes that retain semantic information such as resource references, stack outputs, concatenations, and dynamic references (`src/ir/intrinsic-resolver.ts`).
3. **Intermediate representation** – Resolved values become part of `ResourceIR`, `OutputIR`, and `ParameterIR`. These interfaces describe the template after intrinsics are handled but before any normalization or serialization occurs (`src/ir.ts`).
4. **YAML serialization** – The CLI consumes the IR, turns each resource into a Pulumi YAML block, and serializes every `PropertyValue` using `serializePropertyValue` (`src/cli/ir-to-yaml.ts` and `src/cli/property-serializer.ts`). At this point the remaining semantic markers (e.g., `${resource.prop}` or `fn::join`) are converted into Pulumi YAML expressions.

## Intrinsic Resolution Details

`IrIntrinsicResolver.resolveValue` is the central dispatcher. It:

- Filters out `AWS::NoValue`, recurses through objects/arrays, and parses dynamic reference strings (SSM/Secrets Manager) into structured `DynamicReferenceValue`s (`src/ir/dynamic-references.ts`).
- Handles `Ref`/`Fn::GetAtt` via an `IntrinsicValueAdapter`. The default `IrIntrinsicValueAdapter` converts attribute usage into `ResourceAttributeReference` objects so later phases know which Pulumi resource/property to reference (`src/ir/intrinsic-value-adapter.ts`). Metadata (`cfRef` definitions in `metadata.ts`) controls how `Ref` maps to Pulumi properties, including concatenations when CloudFormation exposes composite identifiers.
- Emits richer IR nodes for structural intrinsics. For example `Fn::Join`, `Fn::Sub`, and other string-building constructs become `ConcatValue` records whenever they cannot be fully reduced to a literal, ensuring the serializer recreates the `fn::join`/`${name}` mix correctly.
- Produces dedicated reference shapes for stack parameters, stack outputs, and cross-stack exports so the serializer can inline parameter defaults and resolve stack-output dependencies (`resolveRef`, `resolveImportValue`).

## Serialization

When `serializeProgramIr` runs, it:

- Allocates Pulumi resource names and gathers parameter defaults and stack outputs.
- Replaces stack-output references with their resolved values (including nested references) to keep YAML self-contained.
- Calls `serializePropertyValue`, which mirrors the resolver’s `PropertyValue` union: primitives become literals; `ResourceAttributeReference` → `${name.property}`; `stackOutput` → `${outputName}`; `parameter` references substitute their default values; `ConcatValue` prints as `fn::join`; dynamic references become `fn::invoke` (wrapped in `fn::secret` for secure values); any new `kind` must be supported here.

## Adding Support for a New Intrinsic

1. **Decide the IR shape** – Can the intrinsic be expressed with the existing `PropertyValue` union (string/array/map/reference/concat/dynamic)? If not, extend `PropertyValue` in `src/ir.ts` with a new discriminated union member.
2. **Teach the resolver** – Add an `isYourIntrinsic` guard and `resolveYourIntrinsic` helper in `src/ir/intrinsic-resolver.ts`. The helper should return the chosen `PropertyValue` representation and reuse `resolveValue` for nested expressions.
3. **Update serialization** – If you added a new union member or a new way `ConcatValue` should be printed, update `serializePropertyValue` (and `resolveStackOutputReferences` when stack-output placeholders may appear) so the Pulumi YAML backend knows how to emit the value.
4. **Test** – Add resolver-level tests under `tests/ir/intrinsic-resolver.test.ts` to pin the IR shape and end-to-end YAML tests under `tests/cli/ir-to-yaml.test.ts` to verify serialized output.

Following this flow keeps intrinsic handling centralized and ensures new intrinsics survive the CloudFormation → IR → Pulumi YAML pipeline without losing intent.

