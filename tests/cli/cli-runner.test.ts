import {
    convertAssemblyDirectoryToProgramIr,
    convertStageInAssemblyDirectoryToProgramIr,
} from '@pulumi/cdk-convert-core/src/assembly';
import { serializeProgramIr } from '../../src/cli/ir-to-yaml';
import { postProcessProgramIr } from '../../src/cli/ir-post-processor';
import * as fs from 'fs-extra';
import { DEFAULT_OUTPUT_FILE, parseArguments, runCliWithOptions, runCli } from '../../src/cli/cli-runner';

jest.mock('@pulumi/cdk-convert-core/src/assembly', () => ({
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
            reportFile: `${DEFAULT_OUTPUT_FILE}.report.json`,
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
            reportFile: `${DEFAULT_OUTPUT_FILE}.report.json`,
        });
    });

    test('parses stack filter list', () => {
        expect(parseArguments(['--assembly', './cdk.out', '--stacks', 'StackA,StackB'])).toEqual({
            assemblyDir: './cdk.out',
            outFile: DEFAULT_OUTPUT_FILE,
            skipCustomResources: false,
            stackFilters: ['StackA', 'StackB'],
            stage: undefined,
            reportFile: `${DEFAULT_OUTPUT_FILE}.report.json`,
        });
    });

    test('captures stage flag', () => {
        expect(parseArguments(['--assembly', './cdk.out', '--stage', 'DevStage'])).toEqual({
            assemblyDir: './cdk.out',
            outFile: DEFAULT_OUTPUT_FILE,
            skipCustomResources: false,
            stackFilters: [],
            stage: 'DevStage',
            reportFile: `${DEFAULT_OUTPUT_FILE}.report.json`,
        });
    });

    test('overrides report path', () => {
        expect(parseArguments(['--assembly', './cdk.out', '--out', 'foo.yaml', '--report', 'foo.json'])).toEqual({
            assemblyDir: './cdk.out',
            outFile: 'foo.yaml',
            skipCustomResources: false,
            stackFilters: [],
            stage: undefined,
            reportFile: 'foo.json',
        });
    });

    test('disables reports when requested', () => {
        expect(parseArguments(['--assembly', './cdk.out', '--no-report'])).toEqual({
            assemblyDir: './cdk.out',
            outFile: DEFAULT_OUTPUT_FILE,
            skipCustomResources: false,
            stackFilters: [],
            stage: undefined,
            reportFile: undefined,
        });
    });
});

describe('runCliWithOptions', () => {
    test('loads program IR and writes YAML plus report', () => {
        mockedConvert.mockReturnValue({ stacks: [] });
        mockedSerialize.mockReturnValue('name: cdk');

        runCliWithOptions({
            assemblyDir: '/app/cdk.out',
            outFile: '/tmp/out/pulumi.yaml',
            skipCustomResources: false,
            stackFilters: [],
            stage: undefined,
            reportFile: '/tmp/out/pulumi.yaml.report.json',
        });

        expect(mockedConvert).toHaveBeenCalledWith('/app/cdk.out', undefined);
        expect(mockedSerialize).toHaveBeenCalledWith({ stacks: [] });
        expect(mockedFs.ensureDirSync).toHaveBeenNthCalledWith(1, '/tmp/out');
        expect(mockedFs.writeFileSync).toHaveBeenNthCalledWith(1, '/tmp/out/pulumi.yaml', 'name: cdk');
        expect(mockedFs.ensureDirSync).toHaveBeenNthCalledWith(2, '/tmp/out');
        expect(mockedFs.writeFileSync.mock.calls[1][0]).toBe('/tmp/out/pulumi.yaml.report.json');
        expect(mockedFs.writeFileSync.mock.calls[1][1]).toContain('"stacks"');
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
            reportFile: undefined,
        });

        const passedSet = mockedConvert.mock.calls[0][1] as Set<string>;
        expect(passedSet).toBeInstanceOf(Set);
        expect(Array.from(passedSet)).toEqual(['StackB']);
        expect(mockedPostProcess).toHaveBeenCalledWith(
            {
                stacks: [{ stackId: 'StackB', stackPath: 'StackB', resources: [] }],
            },
            { skipCustomResources: false, reportCollector: undefined },
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
                reportFile: undefined,
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
            reportFile: undefined,
        });

        expect(mockedConvert).not.toHaveBeenCalled();
        expect(mockedConvertStage).toHaveBeenCalledWith('/app/cdk.out', 'DevStage', undefined);
    });

    test('skips report generation when disabled', () => {
        mockedConvert.mockReturnValue({ stacks: [] });
        mockedSerialize.mockReturnValue('name: cdk');

        runCliWithOptions({
            assemblyDir: '/app/cdk.out',
            outFile: '/tmp/out/pulumi.yaml',
            skipCustomResources: false,
            stackFilters: [],
            stage: undefined,
            reportFile: undefined,
        });

        expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
        expect(mockedFs.writeFileSync).toHaveBeenCalledWith('/tmp/out/pulumi.yaml', 'name: cdk');
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
