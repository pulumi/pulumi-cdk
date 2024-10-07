import * as aws from '@pulumi/aws';
import * as cx from 'aws-cdk-lib/cx-api';
import { getAccountId, getPartition, getRegion } from '@pulumi/aws-native';
import { FileAssetManifest } from '../assembly';
import { FileAssetPackaging } from 'aws-cdk-lib/cloud-assembly-schema';
import { zipDirectory } from '../zip';
import { StackComponentResource } from '../types';

/**
 * ArtifactConverter
 */
export abstract class ArtifactConverter {
    constructor(protected readonly stackComponent: StackComponentResource) {}

    /**
     * Takes a string and resolves any CDK environment placeholders (e.g. accountId, region, partition)
     *
     * @param s - The string that contains the placeholders to replace
     * @returns The string with the placeholders fully resolved
     */
    protected resolvePlaceholders(s: string): Promise<string> {
        const host = this.stackComponent;
        return cx.EnvironmentPlaceholders.replaceAsync(s, {
            async region(): Promise<string> {
                return getRegion({ parent: host }).then((r) => r.region);
            },

            async accountId(): Promise<string> {
                return getAccountId({ parent: host }).then((r) => r.accountId);
            },

            async partition(): Promise<string> {
                return getPartition({ parent: host }).then((p) => p.partition);
            },
        });
    }
}

/**
 * FileAssetManifestConverter handles converting CDK assets into Pulumi resources
 */
export class FileAssetManifestConverter extends ArtifactConverter {
    private _file?: aws.s3.BucketObjectv2;
    public _id?: string;
    public resourceType: string = 'aws:s3:BucketObjectv2';

    constructor(host: StackComponentResource, readonly manifest: FileAssetManifest) {
        super(host);
    }

    public get id(): string {
        if (!this._id) {
            throw new Error('must call convert before accessing file');
        }
        return this._id;
    }

    /**
     * @returns the underlying bucket object pulumi resource
     */
    public get file(): aws.s3.BucketObjectv2 {
        if (!this._file) {
            throw new Error('must call convert before accessing file');
        }
        return this._file;
    }

    /**
     * Converts a CDK file asset into a Pulumi aws.s3.BucketObjectv2 resource
     */
    public convert(): void {
        const name = this.manifest.id.assetId;
        const id = this.manifest.id.destinationId;
        this._id = `${this.stackComponent.name}/${name}/${id}`;

        const outputPath =
            this.manifest.packaging === FileAssetPackaging.FILE
                ? Promise.resolve(this.manifest.path)
                : zipDirectory(this.manifest.path, this.manifest.path + '.zip');

        this._file = new aws.s3.BucketObjectv2(
            this._id,
            {
                source: outputPath,
                bucket: this.resolvePlaceholders(this.manifest.destination.bucketName),
                key: this.resolvePlaceholders(this.manifest.destination.objectKey),
            },
            { parent: this.stackComponent },
        );
    }
}
