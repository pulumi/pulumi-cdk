import * as path from 'path';
import {
    AssemblyManifest,
    Manifest,
    ArtifactType,
    AwsCloudFormationStackProperties,
    ArtifactMetadataEntryType,
} from '@aws-cdk/cloud-assembly-schema';
import * as fs from 'fs-extra';
import { CloudFormationTemplate } from '../cfn';
import { ArtifactManifest, AssetManifestProperties, LogicalIdMetadataEntry } from 'aws-cdk-lib/cloud-assembly-schema';
import { CloudAssembly, CloudFormationStackArtifact } from 'aws-cdk-lib/cx-api';
import { AssetManifest, DockerImageManifestEntry, FileManifestEntry } from 'cdk-assets';
import { StackManifest } from './stack';
import { ConstructTree, StackAsset, StackMetadata } from './types';

/**
 * Reads a Cloud Assembly manifest
 */
export class AssemblyManifestReader {
    public static readonly DEFAULT_FILENAME = 'manifest.json';

    /**
     * Reads a Cloud Assembly manifest from a file
     */
    public static fromFile(fileName: string): AssemblyManifestReader {
        try {
            const obj = Manifest.loadAssemblyManifest(fileName);
            return new AssemblyManifestReader(path.dirname(fileName), obj);
        } catch (e: any) {
            throw new Error(`Cannot read manifest '${fileName}': ${e.message}`);
        }
    }

    /**
     * Reads a Cloud Assembly manifest from a file or a directory
     * If the given filePath is a directory then it will look for
     * a file within the directory with the DEFAULT_FILENAME
     */
    public static fromPath(filePath: string): AssemblyManifestReader {
        let st;
        try {
            st = fs.statSync(filePath);
        } catch (e: any) {
            throw new Error(`Cannot read manifest at '${filePath}': ${e.message}`);
        }
        if (st.isDirectory()) {
            return AssemblyManifestReader.fromFile(path.join(filePath, AssemblyManifestReader.DEFAULT_FILENAME));
        }
        return AssemblyManifestReader.fromFile(filePath);
    }

    /**
     * The directory where the manifest was found
     */
    public readonly directory: string;

    private readonly assembly: CloudAssembly;
    private readonly stacks = new Map<string, CloudFormationStackArtifact>();
    private readonly _stackManifests = new Map<string, StackManifest>();
    private readonly tree: ConstructTree;

    constructor(directory: string, private readonly manifest: AssemblyManifest) {
        this.directory = directory;
        this.assembly = new CloudAssembly(directory, {
            // we don't need version checking / version checking would mean we would have to
            // publish a new version of the library everytime the cdk version increases
            skipVersionCheck: true,
        });
        this.tree = fs.readJsonSync(path.resolve(this.directory, 'tree.json')).tree;
        if (!this.tree.children) {
            throw new Error('Invalid tree.json found');
        }
        this.renderStackManifest();
    }

    private renderStackManifest() {
        for (const [artifactId, artifact] of Object.entries(this.manifest.artifacts ?? {})) {
            if (artifact.type === ArtifactType.AWS_CLOUDFORMATION_STACK) {
                const stackArtifact = this.assembly.getStackArtifact(artifactId);
                this.stacks.set(artifactId, stackArtifact);
                const metadata: StackMetadata = {};
                const props = artifact.properties as AwsCloudFormationStackProperties;
                const template: CloudFormationTemplate = fs.readJSONSync(
                    path.resolve(this.directory, props.templateFile),
                );
                for (const [metadataId, metadataEntry] of Object.entries(artifact.metadata ?? {})) {
                    metadataEntry.forEach((meta) => {
                        if (meta.type === ArtifactMetadataEntryType.LOGICAL_ID) {
                            // For some reason the metadata entry prefixes the path with a `/`
                            const path = metadataId.startsWith('/') ? metadataId.substring(1) : metadataId;
                            metadata[path] = meta.data as LogicalIdMetadataEntry;
                        }
                    });
                }
                const assets = this.getAssetsForStack(artifactId);
                const stackTree = this.tree.children![artifactId];
                const stackManifest = new StackManifest(
                    this.directory,
                    artifactId,
                    props.templateFile,
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
            }
        });
        return assets;
    }
}
