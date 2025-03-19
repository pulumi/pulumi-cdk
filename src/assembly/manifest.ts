import * as path from 'path';
import { AssemblyManifest, Manifest, ArtifactType, ArtifactMetadataEntryType } from '@aws-cdk/cloud-assembly-schema';
import * as fs from 'fs-extra';
import { CloudFormationResource, CloudFormationTemplate, NestedStackTemplate } from '../cfn';
import { ArtifactManifest, LogicalIdMetadataEntry } from 'aws-cdk-lib/cloud-assembly-schema';
import { StackManifest } from './stack';
import { ConstructTree, StackMetadata } from './types';

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
            const obj = Manifest.loadAssemblyManifest(filePath, {
                // Skip version check because we don't want to throw an error if the manifest is from a newer version
                // We choose what features we are supporting, so if new features are added we don't want it to fail on us
                skipVersionCheck: true,
            });
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

                if (!this.tree.children) {
                    throw new Error('Invalid tree.json found');
                }

                const stackTree = this.tree.children[artifactId];
                const nestedStacks = this.loadNestedStacks(template.Resources);
                const stackPaths = Object.keys(nestedStacks).concat([stackTree.path]);
                const metadata = this.getMetadata(artifact, stackPaths);

                const stackManifest = new StackManifest({
                    id: artifactId,
                    templatePath: templateFile,
                    metadata,
                    tree: stackTree,
                    template,
                    dependencies: artifact.dependencies ?? [],
                    nestedStacks,
                });
                this._stackManifests.set(artifactId, stackManifest);
            }
        }
    }

    /**
     * Recursively loads the nested CloudFormation stacks referenced by the provided resources.
     *
     * This method filters the given resources to find those of type 'AWS::CloudFormation::Stack'
     * and with a defined 'aws:asset:path' in their metadata. This identifies a CloudFormation
     * Stack as a nested stack that needs to be loaded from a separate template file instead of
     * a regular stack that's deployed be referencing an existing template in S3.
     * See: https://github.com/aws/aws-cdk/blob/cbe2bec488ff9b9823eacf6de14dff1dcb3033a1/packages/aws-cdk/lib/api/nested-stack-helpers.ts#L139-L145
     *
     * It then reads the corresponding  CloudFormation templates from the specified asset paths before recursively
     * loading any nested stacks they define. It returns the nested stacks in a dictionary keyed by their tree paths.
     *
     * @param resources - An object containing CloudFormation resources, indexed by their logical IDs.
     * @returns An object containing the loaded CloudFormation templates, indexed by their tree paths.
     * @throws Will throw an error if the 'assetPath' metadata of a 'AWS::CloudFormation::Stack' is not a string
     *  or if reading the template file fails.
     */
    private loadNestedStacks(resources: { [logicalIds: string]: CloudFormationResource } | undefined): {
        [path: string]: NestedStackTemplate;
    } {
        return Object.entries(resources ?? {})
            .filter(([_, resource]) => {
                return resource.Type === 'AWS::CloudFormation::Stack' && resource.Metadata?.['aws:asset:path'];
            })
            .reduce((acc, [logicalId, resource]) => {
                const assetPath = resource.Metadata?.['aws:asset:path'];
                if (typeof assetPath !== 'string') {
                    throw new Error(
                        `Expected the Metadata 'aws:asset:path' of ${logicalId} to be a string, got '${assetPath}' of type ${typeof assetPath}`,
                    );
                }

                const cdkPath = resource.Metadata?.['aws:cdk:path'];
                if (!cdkPath) {
                    throw new Error(`Expected the nested stack ${logicalId} to have a 'aws:cdk:path' metadata entry`);
                }
                if (typeof cdkPath !== 'string') {
                    throw new Error(
                        `Expected the Metadata 'aws:cdk:path' of ${logicalId} to be a string, got '${cdkPath}' of type ${typeof cdkPath}`,
                    );
                }

                let template: CloudFormationTemplate;
                const templateFile = path.join(this.directory, assetPath);
                try {
                    template = fs.readJSONSync(path.resolve(templateFile));
                } catch (e) {
                    throw new Error(`Failed to read CloudFormation template at path: ${templateFile}: ${e}`);
                }

                const nestedStackPath = StackManifest.getNestedStackPath(cdkPath, logicalId);

                return {
                    ...acc,
                    [nestedStackPath]: {
                        ...template,
                        logicalId,
                    },
                    ...this.loadNestedStacks(template.Resources),
                };
            }, {} as { [path: string]: NestedStackTemplate });
    }

    /**
     * Creates a metadata map of constructPath to logicalId for all resources in the stack
     *
     * @param artifact - The manifest containing the stack metadata
     * @returns The StackMetadata lookup table
     */
    private getMetadata(artifact: ArtifactManifest, stackPaths: string[]): StackMetadata {
        // Add a '/' to the end of each stack path to make it easier to find the stack path for a resource
        // This is because the stack path suffixed with '/' is the prefix of the resource path but guarantees
        // that there's no collisions between stack paths (e.g. 'MyStack/MyNestedStack' and 'MyStack/MyNestedStackPrime')
        const stackPrefixes = stackPaths.map((stackPath) => `${stackPath}/`);

        const metadata: StackMetadata = {};
        for (const [metadataId, metadataEntry] of Object.entries(artifact.metadata ?? {})) {
            metadataEntry.forEach((meta) => {
                if (meta.type === ArtifactMetadataEntryType.LOGICAL_ID) {
                    // For some reason the metadata entry prefixes the path with a `/`
                    const path = metadataId.startsWith('/') ? metadataId.substring(1) : metadataId;

                    // Find the longest stack path that is a prefix of the resource path. This is the parent stack
                    // of the resource.
                    let stackPath: string | undefined;
                    for (const stackPrefix of stackPrefixes) {
                        if (stackPrefix.length > (stackPath?.length ?? 0) && path.startsWith(stackPrefix)) {
                            stackPath = stackPrefix;
                        }
                    }

                    if (!stackPath && stackPath !== '') {
                        throw new Error(`Failed to determine the stack path for resource at path ${path}`);
                    }

                    metadata[path] = {
                        id: meta.data as LogicalIdMetadataEntry,
                        // Remove the trailing '/' from the stack path again
                        stackPath: stackPath.slice(0, -1),
                    };
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
}
