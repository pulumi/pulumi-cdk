import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { runCliWithOptions } from '../../src/cli/cli-runner';

describe('cli stage integration', () => {
    const assemblyDir = path.resolve(__dirname, '../../cdk-with-stages.out');

    // This test runs against the real staged assembly fixture checked into the repo to ensure
    // we can convert nested stages end-to-end.
    test('converts DevStage assembly to Pulumi YAML', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulumi-stage-'));
        const outFile = path.join(tmpDir, 'Pulumi.yaml');
        try {
            runCliWithOptions({
                assemblyDir,
                outFile,
                skipCustomResources: true,
                stackFilters: ['DevStageDataStack05CC68D7'],
                stage: 'DevStage',
            });

            const yaml = fs.readFileSync(outFile, 'utf8');
            expect(yaml).toContain('PostsTableC82B36F0');
            expect(yaml).not.toContain('DevStageMonitoringStack31822C3B');
        } finally {
            fs.removeSync(tmpDir);
        }
    });
});
