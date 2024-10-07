import { ConstructInfo } from 'aws-cdk-lib/core/lib/private/runtime-info';
import { Node } from 'aws-cdk-lib/core/lib/private/tree-metadata';
import { DockerImageManifestEntry, FileManifestEntry } from 'cdk-assets';

export type StackAsset = FileManifestEntry | DockerImageManifestEntry;

/**
 * Map of CDK construct path to logicalId
 */
export type StackMetadata = { [path: string]: string };

/**
 * ConstructTree is a tree of the current CDK construct
 */
export type ConstructTree = Node;
