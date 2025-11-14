export interface EmitResourceRequest<TOptions = any, TAddress = any> {
    logicalId: string;
    typeName: string;
    props: any;
    options: TOptions;
    resourceAddress?: TAddress;
}

export interface ResourceEmitter<TResult = any, TOptions = any, TAddress = any> {
    emitResource(request: EmitResourceRequest<TOptions, TAddress>): TResult;
}
