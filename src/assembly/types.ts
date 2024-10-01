import { ConstructInfo } from 'aws-cdk-lib/core/lib/private/runtime-info';
import { DockerImageManifestEntry, FileManifestEntry } from 'cdk-assets';

export type StackAsset = FileManifestEntry | DockerImageManifestEntry;

/**
 * Map of CDK construct path to logicalId
 */
export type StackMetadata = { [path: string]: string };

/**
 * ConstructTree is a tree of the current CDK construct
 * It represents the structure in the `tree.json` file and is based
 * off the implementation here:
 * https://github.com/aws/aws-cdk/blob/4bce941fc680ebd396569383f6cf07527541dcc2/packages/aws-cdk-lib/core/lib/private/tree-metadata.ts?plain=1#L177
 */
export interface ConstructTree {
    /**
     * The id of the construct
     */
    readonly id: string;

    /**
     * The path to the construct in the tree, i.e. `parentConstructId/constructId`
     */
    readonly path: string;

    /**
     * The parent construct in the tree.
     * Will be undefined if this is the root construct
     */
    readonly parent?: ConstructTree;

    /**
     * Any children construct in the tree
     */
    readonly children?: { [key: string]: ConstructTree };

    /**
     * Attributes of the construct
     */
    readonly attributes?: { [key: string]: any };

    readonly constructInfo?: ConstructInfo;
}
