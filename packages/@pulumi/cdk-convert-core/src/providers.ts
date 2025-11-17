export enum PulumiProvider {
    AWS_NATIVE = 'aws-native',
}

export function assertSupportedProvider(provider: PulumiProvider): void {
    if (provider !== PulumiProvider.AWS_NATIVE) {
        throw new Error(`Unsupported Pulumi provider ${provider}`);
    }
}
