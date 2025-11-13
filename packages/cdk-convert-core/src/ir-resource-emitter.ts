import { EmitResourceRequest, ResourceEmitter } from './resource-emitter';
import { ResourceIR, ResourceIROptions, StackIR } from './ir';
import { StackAddress } from './assembly';
import { normalizeResourceProperties } from './normalization';
import { PulumiProvider } from './providers';
import { typeToken } from './naming';

export interface IrResourceOptions {
    parent?: StackAddress;
    dependsOn?: StackAddress[];
    retainOnDelete?: boolean;
}

export class IrResourceEmitter implements ResourceEmitter<ResourceIR, IrResourceOptions, StackAddress> {
    constructor(private readonly stack: StackIR) {}

    emitResource(request: EmitResourceRequest<IrResourceOptions, StackAddress>): ResourceIR {
        const pulumiProps = normalizeResourceProperties(request.props, {
            cfnType: request.typeName,
            pulumiProvider: PulumiProvider.AWS_NATIVE,
        });

        const resource: ResourceIR = {
            logicalId: request.logicalId,
            cfnType: request.typeName,
            cfnProperties: request.props,
            typeToken: typeToken(request.typeName),
            props: pulumiProps,
            options: this.toResourceOptions(request.options),
        };

        this.stack.resources.push(resource);
        return resource;
    }

    private toResourceOptions(options?: IrResourceOptions): ResourceIROptions | undefined {
        if (!options) {
            return undefined;
        }

        const irOptions: ResourceIROptions = {};
        if (options.dependsOn && options.dependsOn.length > 0) {
            irOptions.dependsOn = options.dependsOn;
        }
        if (options.retainOnDelete !== undefined) {
            irOptions.retainOnDelete = options.retainOnDelete;
        }

        return Object.keys(irOptions).length > 0 ? irOptions : undefined;
    }
}
