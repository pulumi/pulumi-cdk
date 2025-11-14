import {
    convertAssemblyDirectoryToProgramIr,
    convertStageInAssemblyDirectoryToProgramIr,
} from '@pulumi/cdk-convert-core/assembly';
import { serializeProgramIr } from '../../src/cli/ir-to-yaml';
import { postProcessProgramIr } from '../../src/cli/ir-post-processor';
import * as fs from 'fs-extra';
import {
    DEFAULT_OUTPUT_FILE,
    parseArguments,
    runCliWithOptions,
    runCli,
} from '../../src/cli/cli-runner';

jest.mock('@pulumi/cdk-convert-core/assembly', () => ({
    convertAssemblyDirectoryToProgramIr: jest.fn(),
    convertStageInAssemblyDirectoryToProgramIr: jest.fn(),
}));

jest.mock('../../src/cli/ir-to-yaml', () => ({
    serializeProgramIr: jest.fn(),
}));

jest.mock('../../src/cli/ir-post-processor', () => ({
    postProcessProgramIr: jest.fn((program) => program),
}));

jest.mock('fs-extra', () => ({
    ensureDirSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

const mockedConvert = convertAssemblyDirectoryToProgramIr as jest.MockedFunction<
    typeof convertAssemblyDirectoryToProgramIr
>;
const mockedConvertStage = convertStageInAssemblyDirectoryToProgramIr as jest.MockedFunction<
    typeof convertStageInAssemblyDirectoryToProgramIr
>;
const mockedSerialize = serializeProgramIr as jest.MockedFunction<typeof serializeProgramIr>;
const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedPostProcess = postProcessProgramIr as jest.MockedFunction<typeof postProcessProgramIr>;

beforeEach(() => {
    jest.clearAllMocks();
    mockedPostProcess.mockImplementation((program) => program);
});

describe('parseArguments', () => {
    test('returns defaults when only assembly provided', () => {
        expect(parseArguments(['--assembly', './cdk.out'])).toEqual({
            assemblyDir: './cdk.out',
            outFile: DEFAULT_OUTPUT_FILE,
            skipCustomResources: false,
            stackFilters: [],
            stage: undefined,
        });
    });

    test('throws on unknown flags', () => {
        expect(() => parseArguments(['--foo'])).toThrow(/Unknown argument/);
    });

    test('sets skipCustomResources when flag provided', () => {
        expect(parseArguments(['--assembly', './cdk.out', '--skip-custom'])).toEqual({
            assemblyDir: './cdk.out',
            outFile: DEFAULT_OUTPUT_FILE,
            skipCustomResources: true,
            stackFilters: [],
            stage: undefined,
        });
    });

    test('parses stack filter list', () => {
        expect(parseArguments(['--assembly', './cdk.out', '--stacks', 'StackA,StackB'])).toEqual({
            assemblyDir: './cdk.out',
            outFile: DEFAULT_OUTPUT_FILE,
            skipCustomResources: false,
            stackFilters: ['StackA', 'StackB'],
            stage: undefined,
        });
    });

    test('captures stage flag', () => {
        expect(parseArguments(['--assembly', './cdk.out', '--stage', 'DevStage'])).toEqual({
            assemblyDir: './cdk.out',
            outFile: DEFAULT_OUTPUT_FILE,
            skipCustomResources: false,
            stackFilters: [],
            stage: 'DevStage',
        });
    });
});

describe('runCliWithOptions', () => {
    test('loads program IR and writes YAML', () => {
        mockedConvert.mockReturnValue({ stacks: [] });
        mockedSerialize.mockReturnValue('name: cdk');

        runCliWithOptions({
            assemblyDir: '/app/cdk.out',
            outFile: '/tmp/out/pulumi.yaml',
            skipCustomResources: false,
            stackFilters: [],
            stage: undefined,
        });

        expect(mockedConvert).toHaveBeenCalledWith('/app/cdk.out', undefined);
        expect(mockedSerialize).toHaveBeenCalledWith({ stacks: [] });
        expect(mockedFs.ensureDirSync).toHaveBeenCalledWith('/tmp/out');
        expect(mockedFs.writeFileSync).toHaveBeenCalledWith('/tmp/out/pulumi.yaml', 'name: cdk');
    });

    test('filters stacks before post-processing', () => {
        const program = {
            stacks: [
                { stackId: 'StackA', stackPath: 'StackA', resources: [] },
                { stackId: 'StackB', stackPath: 'StackB', resources: [] },
            ],
        } as any;
        mockedConvert.mockReturnValue(program);
        mockedPostProcess.mockImplementation((p) => p);

        runCliWithOptions({
            assemblyDir: '/app/cdk.out',
            outFile: '/tmp/out/pulumi.yaml',
            skipCustomResources: false,
            stackFilters: ['StackB'],
            stage: undefined,
        });

        const passedSet = mockedConvert.mock.calls[0][1] as Set<string>;
        expect(passedSet).toBeInstanceOf(Set);
        expect(Array.from(passedSet)).toEqual(['StackB']);
        expect(mockedPostProcess).toHaveBeenCalledWith(
            {
                stacks: [{ stackId: 'StackB', stackPath: 'StackB', resources: [] }],
            },
            { skipCustomResources: false },
        );
    });

    test('throws when requested stack missing', () => {
        mockedConvert.mockReturnValue({ stacks: [] });

        expect(() =>
            runCliWithOptions({
                assemblyDir: '/app/cdk.out',
                outFile: '/tmp/out/pulumi.yaml',
                skipCustomResources: false,
                stackFilters: ['Missing'],
                stage: undefined,
            }),
        ).toThrow(/Unknown stack/);
    });

    test('uses stage-specific converter when provided', () => {
        mockedConvertStage.mockReturnValue({ stacks: [] } as any);

        runCliWithOptions({
            assemblyDir: '/app/cdk.out',
            outFile: '/tmp/out/pulumi.yaml',
            skipCustomResources: false,
            stackFilters: [],
            stage: 'DevStage',
        });

        expect(mockedConvert).not.toHaveBeenCalled();
        expect(mockedConvertStage).toHaveBeenCalledWith('/app/cdk.out', 'DevStage', undefined);
    });
});

describe('runCli', () => {
    test('returns error code when required args missing', () => {
        const logger = { log: jest.fn(), error: jest.fn() };
        const code = runCli([], logger as any);
        expect(code).toBe(1);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('--assembly'));
    });
});
