import { DockerImageManifestEntry, FileManifestEntry } from 'cdk-assets';
import { ConstructInfo as CoreConstructInfo } from 'aws-cdk-lib/core/lib/private/runtime-info';

// Taken from https://github.com/aws/aws-cdk/blob/295a547149795cf224cf2fade9f36b6a7654c8ab/packages/aws-cdk-lib/core/lib/private/tree-metadata.ts#L90
// which is now internal
export interface Node {
    readonly id: string;
    readonly path: string;
    readonly children?: { [key: string]: Node };
    readonly attributes?: { [key: string]: any };

    /**
     * Information on the construct class that led to this node, if available
     */
    readonly constructInfo?: CoreConstructInfo;
}

export type StackAsset = FileManifestEntry | DockerImageManifestEntry;

/**
 * Map of CDK construct path to logicalId
 */
export type StackMetadata = { [path: string]: StackAddress };

/**
 * StackAddress uniquely identifies a resource in a cloud assembly
 * across several (nested) stacks.
 */
export type StackAddress = {
    id: string;
    stackPath: string;
};

/**
 * ConstructTree is a tree of the current CDK construct
 */
export type ConstructTree = Node;
