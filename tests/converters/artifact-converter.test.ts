import { FileAssetPackaging, Stack } from 'aws-cdk-lib/core';
import { FileAssetManifestConverter } from '../../src/converters/artifact-converter';
import { StackComponentResource, StackOptions } from '../../src/types';
import { FileAssetManifest } from '../../src/assembly';
import * as pulumi from '@pulumi/pulumi';
import { MockCallArgs, MockResourceArgs } from '@pulumi/pulumi/runtime';

function setMocks(assertFn: (args: MockResourceArgs) => void) {
    pulumi.runtime.setMocks(
        {
            call: (args: MockCallArgs): { [id: string]: any } => {
                switch (args.token) {
                    case 'aws-native:index:getAccountId':
                        return {
                            accountId: '12345678910',
                        };
                    case 'aws-native:index:getRegion':
                        return {
                            region: 'us-east-2',
                        };
                    case 'aws-native:index:getPartition':
                        return {
                            partition: 'aws',
                        };
                    default:
                        return {};
                }
            },
            newResource: (args: MockResourceArgs): { id: string; state: any } => {
                switch (args.type) {
                    case 'cdk:index:stack':
                        return { id: '', state: {} };
                    default:
                        assertFn(args);
                        return {
                            id: args.name + '_id',
                            state: args.inputs,
                        };
                }
            },
        },
        'project',
        'stack',
        false,
    );
}

class MockStackComponent extends StackComponentResource {
    public readonly name = 'stack';
    public readonly assemblyDir: string = 'dir';
    public stack: Stack;
    public options?: StackOptions | undefined;
    constructor() {
        super('stack');
        this.registerOutputs();
    }

    registerOutput(outputId: string, output: any): void {}
}

describe('Artifact Converters', () => {
    test('can convert file artifacts', (done) => {
        setMocks((args) => {
            if (args.type === 'aws:s3/bucketObjectv2:BucketObjectv2') {
                expect(args.id).toEqual('');
                expect(args.name).toEqual(
                    'stack/abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44/current_account-current_region',
                );
                expect(args.inputs).toEqual({
                    bucket: 'cdk-hnb659fds-assets-12345678910-us-east-2',
                    key: 'abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44',
                    source: 'dir/asset.abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44',
                });
            }
        });
        const mockStackComponent = new MockStackComponent();
        const converter = new FileAssetManifestConverter(
            mockStackComponent,
            new FileAssetManifest('dir', {
                genericDestination: undefined,
                genericSource: undefined,
                destination: {
                    bucketName: 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                    objectKey: 'abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44',
                },
                source: {
                    path: 'asset.abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44',
                    packaging: FileAssetPackaging.FILE,
                },
                type: 'file',
                id: {
                    destinationId: 'current_account-current_region',
                    assetId: 'abe4e2f4fcc1aaaf53db4829c23a5cf08795d36cce0f68a3321c1c8d728fec44',
                },
            }),
        );
        converter.convert();
        mockStackComponent.urn.apply(() => done());
    });
});
