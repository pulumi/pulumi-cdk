import { CloudFormationTemplate, CloudFormationResource, CloudFormationOutput, CloudFormationParameter } from '../cfn';
import { StackIR, ProgramIR, StackAddress } from './ir';
import { typeToken } from '../naming';
import { getDependsOn } from '../cfn';
import { IrIntrinsicValueAdapter } from './intrinsic-value-adapter';
import { IrResourceEmitter, IrResourceOptions } from '../ir-resource-emitter';
import { IrIntrinsicResolver } from './intrinsic-resolver';
import { IntrinsicValueAdapter } from '../converters/intrinsic-value-adapter';
import { PropertyValue } from './ir';
import { ResourceEmitter } from '../resource-emitter';

export interface StackConversionInput {
    stackId: string;
    stackPath: string;
    template: CloudFormationTemplate;
}

export interface StackIrConversionOptions {
    adapter?: IntrinsicValueAdapter<any, PropertyValue>;
    emitter?: ResourceEmitter<any, IrResourceOptions, StackAddress>;
    stack?: StackIR;
}

export function convertStacksToProgramIr(stacks: StackConversionInput[]): ProgramIR {
    return {
        stacks: stacks.map(convertStackToIr),
    };
}

export function convertStackToIr(input: StackConversionInput, options?: StackIrConversionOptions): StackIR {
    const { stackId, stackPath, template } = input;
    const stack =
        options?.stack ??
        ({
            stackId,
            stackPath,
            resources: [],
        } satisfies StackIR);
    stack.resources = stack.resources ?? [];
    stack.resources.length = 0;
    stack.outputs = undefined;
    stack.parameters = undefined;

    const adapter = options?.adapter ?? new IrIntrinsicValueAdapter();
    const emitter = options?.emitter ?? new IrResourceEmitter(stack);
    const resolver = new IrIntrinsicResolver({
        stackPath,
        template,
        adapter,
    });

    convertResources(stackPath, template.Resources ?? {}, resolver, emitter);
    stack.outputs = convertOutputs(template.Outputs, resolver);
    stack.parameters = convertParameters(template.Parameters, resolver);

    return stack;
}

function convertResources(
    stackPath: string,
    resources: { [id: string]: CloudFormationResource },
    resolver: IrIntrinsicResolver,
    emitter: ResourceEmitter<any, IrResourceOptions, StackAddress>,
): void {
    Object.entries(resources).forEach(([logicalId, resource]) => {
        emitter.emitResource({
            logicalId,
            typeName: typeToken(resource.Type),
            props: resolver.resolvePropertyMap(resource.Properties ?? {}),
            options: buildResourceOptions(stackPath, resource),
            resourceAddress: {
                id: logicalId,
                stackPath,
            },
        });
    });
}

function buildResourceOptions(stackPath: string, resource: CloudFormationResource): IrResourceOptions | undefined {
    const dependsOn = getDependsOn(resource);
    const retain = resource.DeletionPolicy === 'Retain';

    if (!dependsOn && !retain) {
        return undefined;
    }

    const dependsOnAddresses = dependsOn?.map((id): StackAddress => ({
        id,
        stackPath,
    }));

    return {
        dependsOn: dependsOnAddresses,
        retainOnDelete: retain ? true : undefined,
    };
}

function convertOutputs(outputs: { [id: string]: CloudFormationOutput } | undefined, resolver: IrIntrinsicResolver) {
    if (!outputs) {
        return undefined;
    }

    return Object.entries(outputs).map(([name, output]) => ({
        name,
        value: resolver.resolveValue(output.Value),
        description: undefined,
    }));
}

function convertParameters(
    parameters: { [id: string]: CloudFormationParameter } | undefined,
    resolver: IrIntrinsicResolver,
): StackIR['parameters'] {
    if (!parameters) {
        return undefined;
    }

    return Object.entries(parameters).map(([name, param]) => ({
        name,
        type: param.Type,
        default: param.Default ? resolver.resolveValue(param.Default) : undefined,
    }));
}
