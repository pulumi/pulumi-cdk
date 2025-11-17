import {
    AssemblyManifestReader,
    StackManifest,
    convertAssemblyDirectoryToProgramIr,
    convertAssemblyToProgramIr,
    convertStageInAssemblyDirectoryToProgramIr,
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

    test('convertStageInAssemblyDirectoryToProgramIr loads nested manifest', () => {
        const manifest = createStackManifest();
        const nestedReader = { stackManifests: [manifest] } as unknown as AssemblyManifestReader;
        const rootReader = {
            stackManifests: [],
            loadNestedAssembly: jest.fn().mockReturnValue(nestedReader),
        } as unknown as AssemblyManifestReader;
        const spy = jest.spyOn(AssemblyManifestReader, 'fromDirectory').mockReturnValue(rootReader);

        const program = convertStageInAssemblyDirectoryToProgramIr('/fake/assembly', 'DevStage');

        expect(spy).toHaveBeenCalledWith('/fake/assembly');
        expect(rootReader.loadNestedAssembly).toHaveBeenCalledWith('DevStage');
        expect(program.stacks).toHaveLength(2);
    });

    test('convertAssemblyToProgramIr skips stacks outside the filter set', () => {
        const manifestA = createStackManifest();
        const manifestB = new StackManifest({
            id: 'FilteredStack',
            templatePath: 'stacks/filtered.json',
            metadata: {},
            tree: {
                id: 'FilteredStack',
                path: 'App/Filtered',
            },
            template: {
                Resources: {
                    Topic: {
                        Type: 'AWS::SNS::Topic',
                        Properties: {},
                    },
                },
            },
            dependencies: [],
            nestedStacks: {},
        });
        const reader = { stackManifests: [manifestA, manifestB] } as unknown as AssemblyManifestReader;

        const program = convertAssemblyToProgramIr(reader, new Set(['FilteredStack']));

        expect(program.stacks).toHaveLength(1);
        expect(program.stacks[0].stackId).toBe('FilteredStack');
    });

    test('Fn::ImportValue references resolve to stack output references', () => {
        const producer = new StackManifest({
            id: 'ProducerStack',
            templatePath: 'producer.json',
            metadata: {},
            tree: {
                id: 'ProducerStack',
                path: 'App/Producer',
            },
            template: {
                Resources: {
                    Bucket: {
                        Type: 'AWS::S3::Bucket',
                        Properties: {},
                    },
                },
                Outputs: {
                    BucketArn: {
                        Value: 'arn:aws:s3:::bucket',
                        Export: {
                            Name: 'SharedExport',
                        },
                    },
                },
            },
            dependencies: [],
            nestedStacks: {},
        });

        const consumer = new StackManifest({
            id: 'ConsumerStack',
            templatePath: 'consumer.json',
            metadata: {},
            tree: {
                id: 'ConsumerStack',
                path: 'App/Consumer',
            },
            template: {
                Resources: {
                    Topic: {
                        Type: 'AWS::SNS::Topic',
                        Properties: {
                            SourceArn: {
                                'Fn::ImportValue': 'SharedExport',
                            },
                        },
                    },
                },
            },
            dependencies: [],
            nestedStacks: {},
        });

        const reader = { stackManifests: [producer, consumer] } as unknown as AssemblyManifestReader;

        const program = convertAssemblyToProgramIr(reader);
        const consumerStack = program.stacks.find((stack) => stack.stackId === 'ConsumerStack');
        expect(consumerStack).toBeDefined();
        const topic = consumerStack!.resources.find((resource) => resource.logicalId === 'Topic');
        expect(topic?.props).toMatchObject({
            sourceArn: {
                kind: 'stackOutput',
                stackPath: 'App/Producer',
                outputName: 'BucketArn',
            },
        });
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
