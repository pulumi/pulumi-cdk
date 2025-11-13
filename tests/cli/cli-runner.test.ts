import { convertAssemblyDirectoryToProgramIr } from '@pulumi/cdk-convert-core/assembly';
import { serializeProgramIr } from '../../src/cli/ir-to-yaml';
import * as fs from 'fs-extra';
import {
    DEFAULT_OUTPUT_FILE,
    parseArguments,
    runCliWithOptions,
    runCli,
} from '../../src/cli/cli-runner';

jest.mock('@pulumi/cdk-convert-core/assembly', () => ({
    convertAssemblyDirectoryToProgramIr: jest.fn(),
}));

jest.mock('../../src/cli/ir-to-yaml', () => ({
    serializeProgramIr: jest.fn(),
}));

jest.mock('fs-extra', () => ({
    ensureDirSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

const mockedConvert = convertAssemblyDirectoryToProgramIr as jest.MockedFunction<
    typeof convertAssemblyDirectoryToProgramIr
>;
const mockedSerialize = serializeProgramIr as jest.MockedFunction<typeof serializeProgramIr>;
const mockedFs = fs as jest.Mocked<typeof fs>;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('parseArguments', () => {
    test('returns defaults when only assembly provided', () => {
        expect(parseArguments(['--assembly', './cdk.out'])).toEqual({
            assemblyDir: './cdk.out',
            outFile: DEFAULT_OUTPUT_FILE,
        });
    });

    test('throws on unknown flags', () => {
        expect(() => parseArguments(['--foo'])).toThrow(/Unknown argument/);
    });
});

describe('runCliWithOptions', () => {
    test('loads program IR and writes YAML', () => {
        mockedConvert.mockReturnValue({ stacks: [] });
        mockedSerialize.mockReturnValue('name: cdk');

        runCliWithOptions({
            assemblyDir: '/app/cdk.out',
            outFile: '/tmp/out/pulumi.yaml',
        });

        expect(mockedConvert).toHaveBeenCalledWith('/app/cdk.out');
        expect(mockedSerialize).toHaveBeenCalledWith({ stacks: [] });
        expect(mockedFs.ensureDirSync).toHaveBeenCalledWith('/tmp/out');
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
