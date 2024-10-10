import * as path from 'path';
import { DestinationIdentifier, FileManifestEntry } from 'cdk-assets';
import { CloudFormationParameter, CloudFormationResource, CloudFormationTemplate } from '../cfn';
import { ConstructTree, StackMetadata } from './types';
import { FileAssetPackaging, FileDestination } from 'aws-cdk-lib/cloud-assembly-schema';

/**
 * FileAssetManifest represents a CDK File asset.
 * It is a helper class that is used to better represent a file asset
 * in a way that this library requires
 */
export class FileAssetManifest {
    /**
     * The destination of the file asset (i.e. where the file needs to be published)
     */
    public readonly destination: FileDestination;

    /**
     * The destination id
     */
    public readonly id: DestinationIdentifier;

    /**
     * Absolute path to the asset
     */
    public readonly path: string;
    public readonly packaging: FileAssetPackaging;

    /**
     * @param directory - The directory in which the file manifest is found
     * @param asset - The file asset
     */
    constructor(directory: string, asset: FileManifestEntry) {
        this.destination = asset.destination;
        this.id = asset.id;
        if (asset.source.executable) {
            throw new Error(`file assets produced by commands are not yet supported`);
        }
        this.path = path.join(directory, asset.source.path!);
        this.packaging = asset.source.packaging ?? FileAssetPackaging.FILE;
    }
}

export interface StackManifestProps {
    /**
     * The artifactId of the stack
     */
    readonly id: string;

    /**
     * The path to the CloudFormation template file within the assembly
     */
    readonly templatePath: string;

    /**
     * The StackMetadata for the stack
     */
    readonly metadata: StackMetadata;

    /**
     * The construct tree for the App
     */
    readonly tree: ConstructTree;

    /**
     * The actual CloudFormation template being processed
     */
    readonly template: CloudFormationTemplate;

    /**
     * A list of artifact ids that this stack depends on
     */
    readonly dependencies: string[];
}

/**
 * StackManifest represents a single Stack that needs to be converted
 * It contains all the necessary information for this library to fully convert
 * the resources and assets in the stack to pulumi resources
 */
export class StackManifest {
    /**
     * The artifactId / stackId of the stack
     */
    public id: string;

    /**
     * The construct tree for the stack
     */
    public readonly constructTree: ConstructTree;

    /**
     * The relative path to the stack template file
     */
    public readonly templatePath: string;

    /**
     * The Outputs from the CFN Stack
     */
    public readonly outputs?: { [id: string]: any };

    /**
     * The Parameters from the CFN Stack
     */
    public readonly parameters?: { [id: string]: CloudFormationParameter };

    /**
     * Map of resource logicalId to CloudFormation template resource fragment
     */
    private readonly resources: { [logicalId: string]: CloudFormationResource };

    /**
     *
     */
    private readonly metadata: StackMetadata;
    public readonly dependencies: string[];
    constructor(props: StackManifestProps) {
        this.dependencies = props.dependencies;
        this.outputs = props.template.Outputs;
        this.parameters = props.template.Parameters;
        this.metadata = props.metadata;
        this.templatePath = props.templatePath;
        this.id = props.id;
        this.constructTree = props.tree;
        if (!props.template.Resources) {
            throw new Error('CloudFormation template has no resources!');
        }
        this.resources = props.template.Resources;
    }

    /**
     * Get the CloudFormation logicalId for the CFN resource at the given Construct path
     *
     * @param path - The construct path
     * @returns the logicalId of the resource
     * @throws error if the construct path does not relate to a CFN resource with a logicalId
     */
    public logicalIdForPath(path: string): string {
        if (path in this.metadata) {
            return this.metadata[path];
        }
        throw new Error(`Could not find logicalId for path ${path}`);
    }

    /**
     * Get the CloudFormation template fragment of the resource with the given
     * logicalId
     *
     * @param logicalId - The CFN LogicalId of the resource
     * @returns The resource portion of the CFN template
     */
    public resourceWithLogicalId(logicalId: string): CloudFormationResource {
        if (logicalId in this.resources) {
            return this.resources[logicalId];
        }
        throw new Error(`Could not find resource with logicalId '${logicalId}'`);
    }

    /**
     * Get the CloudFormation template fragment of the resource with the given
     * CDK construct path
     *
     * @param path - The construct path to find the CFN Resource for
     * @returns The resource portion of the CFN template
     */
    public resourceWithPath(path: string): CloudFormationResource {
        const logicalId = this.logicalIdForPath(path);
        if (logicalId && logicalId in this.resources) {
            return this.resources[logicalId];
        }
        throw new Error(`Could not find resource with logicalId '${logicalId}'`);
    }
}
