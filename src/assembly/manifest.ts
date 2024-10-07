import * as path from 'path';
import { AssemblyManifest, Manifest, ArtifactType, ArtifactMetadataEntryType } from '@aws-cdk/cloud-assembly-schema';
import * as fs from 'fs-extra';
import { CloudFormationTemplate } from '../cfn';
import { ArtifactManifest, AssetManifestProperties, LogicalIdMetadataEntry } from 'aws-cdk-lib/cloud-assembly-schema';
import { AssetManifest, DockerImageManifestEntry, FileManifestEntry } from 'cdk-assets';
import { StackManifest } from './stack';
import { ConstructTree, StackAsset, StackMetadata } from './types';
import { warn } from '@pulumi/pulumi/log';

/**
 * Reads a Cloud Assembly manifest
 */
export class AssemblyManifestReader {
    private static readonly DEFAULT_FILENAME = 'manifest.json';

    /**
     * Reads a Cloud Assembly manifest from a file or a directory
     * If the given filePath is a directory then it will look for
     * a file within the directory with the DEFAULT_FILENAME
     */
    public static fromDirectory(dir: string): AssemblyManifestReader {
        const filePath = path.join(dir, AssemblyManifestReader.DEFAULT_FILENAME);
        try {
            fs.statSync(dir);
            const obj = Manifest.loadAssemblyManifest(filePath);
            return new AssemblyManifestReader(dir, obj);
        } catch (e: any) {
            throw new Error(`Cannot read manifest at '${filePath}': ${e}`);
        }
    }

    /**
     * The directory where the manifest was found
     */
    public readonly directory: string;

    private readonly _stackManifests = new Map<string, StackManifest>();
    private readonly tree: ConstructTree;

    constructor(directory: string, private readonly manifest: AssemblyManifest) {
        this.directory = directory;
        try {
            const fullTree = fs.readJsonSync(path.resolve(this.directory, 'tree.json'));
            if (!fullTree.tree || !fullTree.tree.children) {
                throw new Error(`Invalid tree.json found ${JSON.stringify(fullTree)}`);
            }
            this.tree = fullTree.tree;
            this.renderStackManifests();
        } catch (e) {
            throw new Error(`Could not process CDK Cloud Assembly directory: ${e}`);
        }
    }

    /**
     * Renders the StackManifests for all the stacks in the CloudAssembly
     * - Finds all CloudFormation stacks in the assembly
     * - Reads the stack template files
     * - Creates a metadata map of constructPath to logicalId for all resources in the stack
     * - Finds all assets that the stack depends on
     */
    private renderStackManifests() {
        for (const [artifactId, artifact] of Object.entries(this.manifest.artifacts ?? {})) {
            if (artifact.type === ArtifactType.AWS_CLOUDFORMATION_STACK) {
                if (!artifact.properties || !('templateFile' in artifact.properties)) {
                    throw new Error('Invalid CloudFormation artifact. Cannot find the template file');
                }
                const templateFile = artifact.properties.templateFile;

                let template: CloudFormationTemplate;
                try {
                    template = fs.readJSONSync(path.resolve(this.directory, templateFile));
                } catch (e) {
                    throw new Error(`Failed to read CloudFormation template at path: ${templateFile}: ${e}`);
                }

                const metadata = this.getMetadata(artifact);

                const assets = this.getAssetsForStack(artifactId);
                if (!this.tree.children) {
                    throw new Error('Invalid tree.json found');
                }
                const stackTree = this.tree.children[artifactId];
                const stackManifest = new StackManifest(
                    this.directory,
                    artifactId,
                    templateFile,
                    metadata,
                    stackTree,
                    template,
                    assets,
                );
                this._stackManifests.set(artifactId, stackManifest);
            }
        }
    }

    /**
     * Creates a metadata map of constructPath to logicalId for all resources in the stack
     *
     * @param artifact - The manifest containing the stack metadata
     * @returns The StackMetadata lookup table
     */
    private getMetadata(artifact: ArtifactManifest): StackMetadata {
        const metadata: StackMetadata = {};
        for (const [metadataId, metadataEntry] of Object.entries(artifact.metadata ?? {})) {
            metadataEntry.forEach((meta) => {
                if (meta.type === ArtifactMetadataEntryType.LOGICAL_ID) {
                    // For some reason the metadata entry prefixes the path with a `/`
                    const path = metadataId.startsWith('/') ? metadataId.substring(1) : metadataId;
                    metadata[path] = meta.data as LogicalIdMetadataEntry;
                }
            });
        }
        return metadata;
    }

    /**
     * Get the stacks from the Cloud Assembly
     *
     * @returns List of CloudFormationStackArtifacts available in the Cloud Assembly
     */
    public get stackManifests(): StackManifest[] {
        return Array.from(this._stackManifests.values());
    }

    /**
     * Return a list of assets for a given stack
     *
     * @param stackId - The artifactId of the stack to find assets for
     * @returns a list of `StackAsset` for the given stack
     */
    private getAssetsForStack(stackId: string): StackAsset[] {
        const assets: (FileManifestEntry | DockerImageManifestEntry)[] = [];
        for (const artifact of Object.values(this.manifest.artifacts ?? {})) {
            if (
                artifact.type === ArtifactType.ASSET_MANIFEST &&
                (artifact.properties as AssetManifestProperties)?.file === `${stackId}.assets.json`
            ) {
                assets.push(...this.assetsFromAssetManifest(artifact));
            }
        }
        return assets;
    }

    /**
     * Get a list of assets from the asset manifest.
     *
     * @param artifact - An ArtifactManifest to extract individual assets from
     * @returns a list of file and docker assets found in the manifest
     */
    private assetsFromAssetManifest(artifact: ArtifactManifest): StackAsset[] {
        const assets: (FileManifestEntry | DockerImageManifestEntry)[] = [];
        const fileName = (artifact.properties as AssetManifestProperties).file;
        const assetManifest = AssetManifest.fromFile(path.join(this.directory, fileName));
        assetManifest.entries.forEach((entry) => {
            if (entry.type === 'file') {
                const source = (entry as FileManifestEntry).source;
                // This will ignore template assets
                if (source.path && source.path.startsWith('asset.')) {
                    assets.push(entry as FileManifestEntry);
                }
            } else if (entry.type === 'docker-image') {
                const source = (entry as DockerImageManifestEntry).source;
                if (source.directory && source.directory.startsWith('asset.')) {
                    assets.push(entry as DockerImageManifestEntry);
                }
            } else {
                warn(`found unexpected asset type: ${entry.type}`);
            }
        });
        return assets;
    }
}
