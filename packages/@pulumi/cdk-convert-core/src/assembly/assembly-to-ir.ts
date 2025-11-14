import { AssemblyManifestReader } from './manifest';
import { StackManifest } from './stack';
import { CloudFormationTemplate } from '../cfn';
import { ProgramIR, StackIR } from '../ir';
import { convertStackToIr } from '../ir/stack-converter';

/**
 * Loads a Cloud Assembly from disk and converts every stack into ProgramIR using the shared
 * StackConverter pipeline.
 */
export function convertAssemblyDirectoryToProgramIr(assemblyDir: string): ProgramIR {
    const manifest = AssemblyManifestReader.fromDirectory(assemblyDir);
    return convertAssemblyToProgramIr(manifest);
}

/**
 * Converts the stacks contained in the supplied manifest reader into a ProgramIR snapshot.
 */
export function convertAssemblyToProgramIr(manifest: AssemblyManifestReader): ProgramIR {
    const stacks: StackIR[] = [];
    for (const stackManifest of manifest.stackManifests) {
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
