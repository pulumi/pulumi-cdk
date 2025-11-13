import { stringify } from 'yaml';
import { ProgramIR, PropertyMap, PropertyValue, ResourceIR, StackAddress } from '@pulumi/cdk-convert-core';
import { PropertySerializationContext, serializePropertyValue } from './property-serializer';

const DEFAULT_PROJECT_NAME = 'cdk-converted';

interface PulumiYamlDocument {
    name: string;
    runtime: string;
    resources: Record<string, PulumiYamlResource>;
}

interface PulumiYamlResource {
    type: string;
    properties?: Record<string, unknown>;
    options?: PulumiYamlResourceOptions;
}

interface PulumiYamlResourceOptions {
    dependsOn?: string[];
    protect?: boolean;
}

export function serializeProgramIr(program: ProgramIR): string {
    const resourceNames = new ResourceNameAllocator(program);
    const parameterDefaults = collectParameterDefaults(program);
    const stackOutputs = collectStackOutputs(program);

    const ctx: PropertySerializationContext = {
        getResourceName: (address) => resourceNames.getName(address),
        getStackOutputName: () => undefined,
        getParameterDefault: (stackPath, parameterName) =>
            parameterDefaults.get(parameterKey(stackPath, parameterName)),
    };

    const document: PulumiYamlDocument = {
        name: DEFAULT_PROJECT_NAME,
        runtime: 'yaml',
        resources: buildResourceMap(program, resourceNames, ctx, stackOutputs),
    };

    return stringify(document, {
        lineWidth: 0,
    });
}

function buildResourceMap(
    program: ProgramIR,
    names: ResourceNameAllocator,
    ctx: PropertySerializationContext,
    stackOutputs: Map<string, PropertyValue>,
): Record<string, PulumiYamlResource> {
    const resources: Record<string, PulumiYamlResource> = {};

    for (const stack of program.stacks) {
        for (const resource of stack.resources) {
            const name = names.getName({
                id: resource.logicalId,
                stackPath: stack.stackPath,
            });
            if (!name) {
                throw new Error(`Failed to allocate name for ${stack.stackPath}/${resource.logicalId}`);
            }

            const serializedProps = serializeResourceProperties(resource.props, ctx, stackOutputs);
            const options = serializeResourceOptions(resource, names);

            const resourceBlock: PulumiYamlResource = {
                type: resource.typeToken,
            };

            if (serializedProps && Object.keys(serializedProps).length > 0) {
                resourceBlock.properties = serializedProps;
            }

            if (options) {
                resourceBlock.options = options;
            }

            resources[name] = resourceBlock;
        }
    }

    return resources;
}

function serializeResourceProperties(
    props: PropertyMap,
    ctx: PropertySerializationContext,
    stackOutputs: Map<string, PropertyValue>,
) {
    const resolvedProps = resolveStackOutputReferences(props as PropertyValue, stackOutputs);
    return serializePropertyValue(resolvedProps, ctx) as Record<string, unknown>;
}

function serializeResourceOptions(
    resource: ResourceIR,
    names: ResourceNameAllocator,
): PulumiYamlResourceOptions | undefined {
    const opts: PulumiYamlResourceOptions = {};

    if (resource.options?.dependsOn) {
        const resolved = resource.options.dependsOn.map((address) => {
            const name = names.getName(address);
            if (!name) {
                throw new Error(`Failed to resolve dependsOn target ${address.stackPath}/${address.id}`);
            }
            return formatResourceReference(name);
        });

        if (resolved.length > 0) {
            opts.dependsOn = resolved;
        }
    }

    if (resource.options?.retainOnDelete) {
        opts.protect = true;
    }

    return Object.keys(opts).length > 0 ? opts : undefined;
}

function formatResourceReference(name: string): string {
    return `\${${name}}`;
}

class ResourceNameAllocator {
    private readonly nameByAddress = new Map<string, string>();
    private readonly usedNames = new Set<string>();

    constructor(program: ProgramIR) {
        for (const stack of program.stacks) {
            for (const resource of stack.resources) {
                const address: StackAddress = {
                    id: resource.logicalId,
                    stackPath: stack.stackPath,
                };
                const slug = slugifyName(stack.stackPath, resource.logicalId);
                const unique = this.ensureUnique(slug);
                this.nameByAddress.set(addressKey(address), unique);
            }
        }
    }

    getName(address: StackAddress): string | undefined {
        return this.nameByAddress.get(addressKey(address));
    }

    private ensureUnique(base: string): string {
        const normalized = base || 'resource';
        if (!this.usedNames.has(normalized)) {
            this.usedNames.add(normalized);
            return normalized;
        }

        let suffix = 1;
        while (this.usedNames.has(`${normalized}-${suffix}`)) {
            suffix++;
        }

        const unique = `${normalized}-${suffix}`;
        this.usedNames.add(unique);
        return unique;
    }
}

function slugifyName(stackPath: string, logicalId: string): string {
    const combined = `${stackPath}-${logicalId}`;
    const withWordBoundaries = combined.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
    const slug = withWordBoundaries
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
        .toLowerCase();

    return slug || 'resource';
}

function collectParameterDefaults(program: ProgramIR): Map<string, PropertyValue> {
    const defaults = new Map<string, PropertyValue>();
    for (const stack of program.stacks) {
        if (!stack.parameters) {
            continue;
        }
        for (const parameter of stack.parameters) {
            if (parameter.default !== undefined) {
                defaults.set(parameterKey(stack.stackPath, parameter.name), parameter.default);
            }
        }
    }
    return defaults;
}

function parameterKey(stackPath: string, parameterName: string): string {
    return `${stackPath}::${parameterName}`;
}

function addressKey(address: StackAddress): string {
    return `${address.stackPath}::${address.id}`;
}

function collectStackOutputs(program: ProgramIR): Map<string, PropertyValue> {
    const outputs = new Map<string, PropertyValue>();
    for (const stack of program.stacks) {
        if (!stack.outputs) {
            continue;
        }
        for (const output of stack.outputs) {
            outputs.set(stackOutputKey(stack.stackPath, output.name), output.value);
        }
    }
    return outputs;
}

function stackOutputKey(stackPath: string, outputName: string): string {
    return `${stackPath}::${outputName}`;
}

function resolveStackOutputReferences(
    value: PropertyValue,
    stackOutputs: Map<string, PropertyValue>,
    seen?: string[],
): PropertyValue {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => resolveStackOutputReferences(item, stackOutputs, seen));
    }

    if (isPropertyMap(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [
                key,
                resolveStackOutputReferences(nested, stackOutputs, seen),
            ]),
        );
    }

    switch (value.kind) {
        case 'stackOutput':
            return resolveStackOutputValue(value, stackOutputs, seen ?? []);
        case 'concat':
            return {
                kind: 'concat',
                delimiter: value.delimiter,
                values: value.values.map((item) => resolveStackOutputReferences(item, stackOutputs, seen)),
            };
        default:
            return value;
    }
}

function resolveStackOutputValue(
    ref: { kind: 'stackOutput'; stackPath: string; outputName: string },
    stackOutputs: Map<string, PropertyValue>,
    seen: string[],
): PropertyValue {
    const key = stackOutputKey(ref.stackPath, ref.outputName);
    if (seen.includes(key)) {
        throw new Error(`Detected circular stack output reference involving ${ref.stackPath}/${ref.outputName}`);
    }
    const value = stackOutputs.get(key);
    if (value === undefined) {
        throw new Error(`Failed to resolve stack output ${ref.outputName} in stack ${ref.stackPath}`);
    }
    return resolveStackOutputReferences(value, stackOutputs, [...seen, key]);
}

function isPropertyMap(value: PropertyValue): value is PropertyMap {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !('kind' in value);
}
