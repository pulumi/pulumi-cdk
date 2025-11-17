# Agent Handoff

Welcome! To continue the CDK-to-Pulumi CLI prototype:

1. Read `spec.md` for the full implementation plan and TODO checklist.
2. Update the checklist in `spec.md` as you complete tasks.
3. Keep this file up to date if the handoff process changes.

Thanks and good luck!

## Status Updates

- See `spec.md` for the authoritative implementation plan, checklist, and latest status.
- Remember to commit frequently as you land logical chunks so handoffs stay easy to follow.

## CLI Prototype Workflow

- The experimental `cdk-to-pulumi` CLI lives under `src/cli/cli-runner.ts` and is also exposed via `./bin/cdk-to-pulumi`.
- Usage pattern:
  1. Synthesize the target CDK app so `cdk.out/` exists.
  2. Run `npx ts-node src/cli/cli-runner.ts --assembly ./cdk.out --out dist/Pulumi.yaml` (or the bin script) to emit Pulumi YAML. Include `--stage`/`--stacks`/`--skip-custom` as needed.
  3. The CLI writes `<outFile>.report.json` unless `--no-report` is passed; the report captures per-stack stats, skipped resources, AWS Classic fallbacks, and fan-out rewrites.
- Targeted tests:
  - `npm test -- cli-runner` covers argument parsing + CLI plumbing.
  - `npm test -- conversion-report` covers the report builder.
- After landing CLI changes, update `spec.md` checklist and keep this file in sync with any workflow adjustments.
