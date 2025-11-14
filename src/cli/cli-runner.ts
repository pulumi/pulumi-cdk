import * as fs from 'fs-extra';
import * as path from 'path';
import {
    convertAssemblyDirectoryToProgramIr,
    convertStageInAssemblyDirectoryToProgramIr,
} from '@pulumi/cdk-convert-core/src/assembly';
import { ProgramIR } from '@pulumi/cdk-convert-core';
import { serializeProgramIr } from './ir-to-yaml';
import { postProcessProgramIr, PostProcessOptions } from './ir-post-processor';

export const DEFAULT_OUTPUT_FILE = 'Pulumi.yaml';

export interface CliOptions {
    assemblyDir: string;
    outFile: string;
    skipCustomResources: boolean;
    stackFilters: string[];
    stage?: string;
}

class CliError extends Error {}

export function parseArguments(argv: string[]): CliOptions {
    let assemblyDir: string | undefined;
    let outFile: string | undefined;
    let skipCustomResources = false;
    const stackFilters: string[] = [];
    let stage: string | undefined;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--assembly':
                assemblyDir = requireValue(arg, argv[++i]);
                break;
            case '--out':
                outFile = requireValue(arg, argv[++i]);
                break;
            case '--skip-custom':
                skipCustomResources = true;
                break;
            case '--stacks': {
                const value = requireValue(arg, argv[++i]);
                stackFilters.push(...parseList(value));
                break;
            }
            case '--stage':
                stage = requireValue(arg, argv[++i]);
                break;
            case '--help':
            case '-h':
                throw new CliError(usage());
            default:
                throw new CliError(`Unknown argument: ${arg}\n${usage()}`);
        }
    }

    if (!assemblyDir) {
        throw new CliError(`Missing required option --assembly\n${usage()}`);
    }

    return {
        assemblyDir,
        outFile: outFile ?? DEFAULT_OUTPUT_FILE,
        skipCustomResources,
        stackFilters,
        stage,
    };
}

export function runCliWithOptions(options: CliOptions): void {
    const program = loadProgramIr(
        options.assemblyDir,
        {
            skipCustomResources: options.skipCustomResources,
        },
        options.stackFilters,
        options.stage,
    );
    const yaml = serializeProgramIr(program);
    const targetDir = path.dirname(options.outFile);
    fs.ensureDirSync(targetDir);
    fs.writeFileSync(options.outFile, yaml);
}

export function runCli(argv: string[], logger: Pick<Console, 'log' | 'error'> = console): number {
    try {
        const options = parseArguments(argv);
        const resolved: CliOptions = {
            assemblyDir: path.resolve(options.assemblyDir),
            outFile: path.resolve(options.outFile),
            skipCustomResources: options.skipCustomResources,
            stackFilters: options.stackFilters,
            stage: options.stage,
        };
        runCliWithOptions(resolved);
        logger.log(`Wrote Pulumi YAML to ${resolved.outFile}`);
        return 0;
    } catch (err) {
        if (err instanceof CliError) {
            logger.error(err.message);
        } else if (err instanceof Error) {
            logger.error(err.message);
        } else {
            logger.error(err);
        }
        return 1;
    }
}

export function main(argv = process.argv.slice(2)) {
    const code = runCli(argv, console);
    if (code !== 0) {
        process.exit(code);
    }
}

function loadProgramIr(
    assemblyDir: string,
    options?: PostProcessOptions,
    stackFilters?: string[],
    stage?: string,
): ProgramIR {
    const stackFilterSet = stackFilters && stackFilters.length > 0 ? new Set(stackFilters) : undefined;
    const program = stage
        ? convertStageInAssemblyDirectoryToProgramIr(assemblyDir, stage, stackFilterSet)
        : convertAssemblyDirectoryToProgramIr(assemblyDir, stackFilterSet);
    const filtered = filterProgramStacks(program, stackFilters);
    return postProcessProgramIr(filtered, options);
}

function requireValue(flag: string, value: string | undefined): string {
    if (!value) {
        throw new CliError(`Missing value for ${flag}`);
    }
    return value;
}

function usage(): string {
    return 'Usage: cdk-to-pulumi --assembly <cdk.out> [--stage <name>] [--out <pulumi.yaml>] [--skip-custom] [--stacks <name1,name2>]';
}

function parseList(value: string): string[] {
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function filterProgramStacks(program: ProgramIR, stackFilters?: string[]): ProgramIR {
    if (!stackFilters || stackFilters.length === 0) {
        return program;
    }
    const requested = new Set(stackFilters);
    const stacks = program.stacks.filter((stack) => requested.has(stack.stackId));
    const matched = new Set(stacks.map((stack) => stack.stackId));
    const missing = stackFilters.filter((name) => !matched.has(name));
    if (missing.length > 0) {
        throw new CliError(`Unknown stack(s): ${missing.join(', ')}`);
    }
    return { ...program, stacks };
}

if (require.main === module) {
    main();
}
