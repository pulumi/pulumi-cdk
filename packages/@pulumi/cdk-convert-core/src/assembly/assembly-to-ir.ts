import { AssemblyManifestReader } from './manifest';
import { StackManifest } from './stack';
import { CloudFormationTemplate } from '../cfn';
import { ProgramIR, StackIR } from '../ir';
import { convertStackToIr } from '../ir/stack-converter';

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
    const stacks: StackIR[] = [];
    for (const stackManifest of manifest.stackManifests) {
        if (stackFilter && !stackFilter.has(stackManifest.id)) {
            continue;
        }
        stacks.push(...convertStackManifest(stackManifest));
    }

    return { stacks };
}

function convertStackManifest(stack: StackManifest): StackIR[] {
    return Object.entries(stack.stacks).map(([stackPath, template]) =>
        convertStackToIr({
            stackId: deriveStackId(stack, stackPath),
            stackPath,
            template: template as CloudFormationTemplate,
        }),
    );
}

function deriveStackId(stack: StackManifest, stackPath: string): string {
    return stackPath === stack.constructTree.path ? stack.id : stackPath;
}
