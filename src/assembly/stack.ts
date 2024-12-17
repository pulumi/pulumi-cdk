import * as path from 'path';
import { DestinationIdentifier, FileManifestEntry } from 'cdk-assets';
import { CloudFormationResource, CloudFormationTemplate, NestedStackTemplate } from '../cfn';
import { ConstructTree, StackAddress, StackMetadata } from './types';
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

    /**
     * The nested stack CloudFormation templates, indexed by their tree path.
     */
    readonly nestedStacks: { [path: string]: NestedStackTemplate };
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

    public readonly stacks: { [path: string]: CloudFormationTemplate };

    private readonly metadata: StackMetadata;
    public readonly dependencies: string[];

    constructor(props: StackManifestProps) {
        this.dependencies = props.dependencies;
        this.metadata = props.metadata;
        this.templatePath = props.templatePath;
        this.id = props.id;
        this.constructTree = props.tree;
        if (!props.template.Resources) {
            throw new Error('CloudFormation template has no resources!');
        }

        this.stacks = {
            [props.tree.path]: props.template,
            ...props.nestedStacks,
        };
    }

    /**
     * Checks if the stack is the root stack
     * @param stackPath - The path to the stack
     * @returns whether the stack is the root stack
     */
    public isRootStack(stackPath: string): boolean {
        return stackPath === this.constructTree.path;
    }

    /**
     * Get the root stack template
     * @returns the root stack template
     */
    public getRootStack(): CloudFormationTemplate {
        return this.stacks[this.constructTree.path];
    }

    /**
     * Get the CloudFormation stack address for the CFN resource at the given Construct path
     *
     * @param path - The construct path
     * @returns the metadata of the resource
     * @throws error if the construct path does not relate to a CFN resource
     */
    public resourceAddressForPath(path: string): StackAddress {
        if (path in this.metadata) {
            return this.metadata[path];
        }
        throw new Error(`Could not find stack address for path ${path}`);
    }

    /**
     * Get the CloudFormation template fragment of the resource with the given
     * logicalId in the given stack
     *
     * @param stackPath - The path to the stack
     * @param logicalId - The CFN LogicalId of the resource
     * @returns The resource portion of the CFN template
     */
    public resourceWithLogicalId(stackPath: string, logicalId: string): CloudFormationResource {
        const stackTemplate = this.stacks[stackPath];
        if (!stackTemplate) {
            throw new Error(`Could not find stack template for path ${stackPath}`);
        }
        const resourcesToSearch = stackTemplate.Resources ?? {};
        if (logicalId in resourcesToSearch) {
            return resourcesToSearch[logicalId];
        }
        throw new Error(`Could not find resource with logicalId '${logicalId}'`);
    }

    /**
     * Get the nested stack path from the path of the nested stack resource (i.e. 'AWS::CloudFormation::Stack').
     * For Nested Stacks, there's two nodes in the tree that are of interest. The first node is the `AWS::CloudFormation::Stack` resource,
     * it's located at the path `parent/${NESTED_STACK_NAME}.NestedStack/${NESTED_STACK_NAME}.NestedStackResource`.
     * This is the input to the function. The second node houses all of the children resources of the nested stack.
     * It's located at the path `parent/${NESTED_STACK_NAME}`. This is the the return value of the function.
     *
     * The tree structure looks like this:
     * ```
     * Root
     * ├── MyNestedStack.NestedStack
     * │   └── AWS::CloudFormation::Stack (Nested Stack Resource)
     * │       └── Properties
     * │           └── Parameters
     * │               └── MyParameter
     * │
     * ├── MyNestedStack (Nested Stack Node - Path returned by this function)
     * │   ├── ChildResource1
     * │   │   └── Properties
     * │   └── ChildResource2
     * │       └── Properties
     * ```
     *
     * @param nestedStackResourcePath - The path to the nested stack resource in the construct tree
     * @param logicalId - The logicalId of the nested stack
     * @returns The path to the nested stack wrapper node in the construct tree
     */
    public static getNestedStackPath(nestedStackResourcePath: string, logicalId: string): string {
        const cdkPathParts = nestedStackResourcePath.split('/');
        if (cdkPathParts.length < 3) {
            throw new Error(
                `Failed to detect the nested stack path for ${logicalId}. The path is too short ${nestedStackResourcePath}, expected at least 3 parts`,
            );
        }
        const nestedStackPath = cdkPathParts.slice(0, -1).join('/');
        if (nestedStackPath.endsWith('.NestedStack')) {
            return nestedStackPath.slice(0, -'.NestedStack'.length);
        } else {
            throw new Error(
                `Failed to detect the nested stack path for ${logicalId}. The path does not end with '.NestedStack': ${nestedStackPath}`,
            );
        }
    }
}
