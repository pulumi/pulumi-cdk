import * as fs from 'fs-extra';
import * as path from 'path';
import { convertAssemblyDirectoryToProgramIr } from '@pulumi/cdk-convert-core/assembly';
import { ProgramIR } from '@pulumi/cdk-convert-core';
import { serializeProgramIr } from './ir-to-yaml';

export const DEFAULT_OUTPUT_FILE = 'pulumi.yaml';

export interface CliOptions {
    assemblyDir: string;
    outFile: string;
}

class CliError extends Error {}

export function parseArguments(argv: string[]): CliOptions {
    let assemblyDir: string | undefined;
    let outFile: string | undefined;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--assembly':
                assemblyDir = requireValue(arg, argv[++i]);
                break;
            case '--out':
                outFile = requireValue(arg, argv[++i]);
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
    };
}

export function runCliWithOptions(options: CliOptions): void {
    const program = loadProgramIr(options.assemblyDir);
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

function loadProgramIr(assemblyDir: string): ProgramIR {
    return convertAssemblyDirectoryToProgramIr(assemblyDir);
}

function requireValue(flag: string, value: string | undefined): string {
    if (!value) {
        throw new CliError(`Missing value for ${flag}`);
    }
    return value;
}

function usage(): string {
    return 'Usage: cdk-to-pulumi --assembly <cdk.out> [--out <pulumi.yaml>]';
}

if (require.main === module) {
    main();
}
