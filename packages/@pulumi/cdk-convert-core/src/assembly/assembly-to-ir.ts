import { AssemblyManifestReader } from './manifest';
import { StackManifest } from './stack';
import { CloudFormationTemplate } from '../cfn';
import { ProgramIR, StackIR, StackOutputReference } from '../ir';
import { convertStackToIr, StackConversionInput } from '../resolvers/stack-converter';

/**
 * Loads a Cloud Assembly from disk and converts every stack into ProgramIR using the shared
 * StackConverter pipeline.
 */
export function convertAssemblyDirectoryToProgramIr(assemblyDir: string, stackFilter?: Set<string>): ProgramIR {
    const manifest = AssemblyManifestReader.fromDirectory(assemblyDir);
    return convertAssemblyToProgramIr(manifest, stackFilter);
}

/**
 * Loads a nested stage within a Cloud Assembly and converts its stacks into ProgramIR.
 */
export function convertStageInAssemblyDirectoryToProgramIr(
    assemblyDir: string,
    stageName: string,
    stackFilter?: Set<string>,
): ProgramIR {
    const manifest = AssemblyManifestReader.fromDirectory(assemblyDir);
    const stageManifest = manifest.loadNestedAssembly(stageName);
    return convertAssemblyToProgramIr(stageManifest, stackFilter);
}

/**
 * Converts the stacks contained in the supplied manifest reader into a ProgramIR snapshot.
 */
export function convertAssemblyToProgramIr(manifest: AssemblyManifestReader, stackFilter?: Set<string>): ProgramIR {
    const inputs: StackConversionInput[] = [];
    for (const stackManifest of manifest.stackManifests) {
        if (stackFilter && !stackFilter.has(stackManifest.id)) {
            continue;
        }
        inputs.push(...collectStackConversionInputs(stackManifest));
    }

    const exportLookup = buildExportLookup(inputs);
    const stacks = inputs.map((input) =>
        convertStackToIr(input, {
            lookupExport: (name) => exportLookup.get(name),
        }),
    );

    return { stacks };
}

function collectStackConversionInputs(stack: StackManifest): StackConversionInput[] {
    return Object.entries(stack.stacks).map(([stackPath, template]) => ({
        stackId: deriveStackId(stack, stackPath),
        stackPath,
        template: template as CloudFormationTemplate,
    }));
}

function deriveStackId(stack: StackManifest, stackPath: string): string {
    return stackPath === stack.constructTree.path ? stack.id : stackPath;
}

function buildExportLookup(inputs: StackConversionInput[]): Map<string, StackOutputReference> {
    const exports = new Map<string, StackOutputReference>();

    for (const input of inputs) {
        const outputEntries = Object.entries(input.template.Outputs ?? {});
        for (const [outputName, output] of outputEntries) {
            const exportName = output.Export?.Name;
            if (typeof exportName !== 'string' || exportName.length === 0) {
                continue;
            }

            if (exports.has(exportName)) {
                const existing = exports.get(exportName)!;
                throw new Error(
                    `Duplicate export name '${exportName}' found in stacks ${existing.stackPath} and ${input.stackPath}`,
                );
            }

            exports.set(exportName, {
                kind: 'stackOutput',
                stackPath: input.stackPath,
                outputName,
            });
        }
    }

    return exports;
}
