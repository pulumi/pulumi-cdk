import * as cx from 'aws-cdk-lib/cx-api';
import { getAccountId, getPartition, getRegion } from '@pulumi/aws-native';
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
