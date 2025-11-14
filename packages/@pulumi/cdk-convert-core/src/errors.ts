export class CdkAdapterError extends Error {
    constructor(message: string) {
        super(`[CDK Adapter] ${message}`);
    }
}
