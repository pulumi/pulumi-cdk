import {
    AssemblyManifestReader,
    StackManifest,
    convertAssemblyDirectoryToProgramIr,
    convertAssemblyToProgramIr,
} from '@pulumi/cdk-convert-core/assembly';
import { CloudFormationTemplate, NestedStackTemplate } from '@pulumi/cdk-convert-core';

describe('convertAssemblyToProgramIr', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('converts root and nested stacks from manifest', () => {
        const manifest = createStackManifest();
        const reader = { stackManifests: [manifest] } as unknown as AssemblyManifestReader;

        const program = convertAssemblyToProgramIr(reader);

        expect(program.stacks).toHaveLength(2);
        const [root, nested] = program.stacks;
        expect(root.stackId).toBe('TestStack');
        expect(root.stackPath).toBe('App/Main');
        expect(root.resources).toHaveLength(1);
        expect(root.resources[0].typeToken).toBe('aws-native:s3:Bucket');

        expect(nested.stackId).toBe('App/Main/NestedStack');
        expect(nested.stackPath).toBe('App/Main/NestedStack');
        expect(nested.resources).toHaveLength(1);
        expect(nested.resources[0].typeToken).toBe('aws-native:sns:Topic');
    });

    test('convertAssemblyDirectoryToProgramIr loads manifest via reader', () => {
        const manifest = createStackManifest();
        const fakeReader = { stackManifests: [manifest] } as unknown as AssemblyManifestReader;
        const spy = jest.spyOn(AssemblyManifestReader, 'fromDirectory').mockReturnValue(fakeReader);

        const program = convertAssemblyDirectoryToProgramIr('/fake/assembly');

        expect(spy).toHaveBeenCalledWith('/fake/assembly');
        expect(program.stacks).toHaveLength(2);
    });
});

function createStackManifest(): StackManifest {
    const rootTemplate: CloudFormationTemplate = {
        Resources: {
            Bucket: {
                Type: 'AWS::S3::Bucket',
                Properties: {
                    BucketName: 'data',
                },
            },
        },
    };

    const nestedTemplate: NestedStackTemplate = {
        logicalId: 'NestedStack',
        Resources: {
            Topic: {
                Type: 'AWS::SNS::Topic',
                Properties: {},
            },
        },
    };

    return new StackManifest({
        id: 'TestStack',
        templatePath: 'stacks/test-stack.template.json',
        metadata: {},
        tree: {
            id: 'TestStack',
            path: 'App/Main',
        },
        template: rootTemplate,
        dependencies: [],
        nestedStacks: {
            'App/Main/NestedStack': nestedTemplate,
        },
    });
}
