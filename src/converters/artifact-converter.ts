import * as cx from 'aws-cdk-lib/cx-api';
import { getAccountId, getPartition, getRegion } from '@pulumi/aws-native';
import { AppComponent } from '../types';

/**
 * ArtifactConverter
 */
export abstract class ArtifactConverter {
    constructor(protected readonly app: AppComponent) {}

    /**
     * Takes a string and resolves any CDK environment placeholders (e.g. accountId, region, partition)
     *
     * @param s - The string that contains the placeholders to replace
     * @returns The string with the placeholders fully resolved
     */
    protected resolvePlaceholders(s: string): Promise<string> {
        const host = this.app;
        return cx.EnvironmentPlaceholders.replaceAsync(s, {
            async region(): Promise<string> {
                return getRegion({ parent: host.component }).then((r) => r.region);
            },

            async accountId(): Promise<string> {
                return getAccountId({ parent: host.component }).then((r) => r.accountId);
            },

            async partition(): Promise<string> {
                return getPartition({ parent: host.component }).then((p) => p.partition);
            },
        });
    }
}
