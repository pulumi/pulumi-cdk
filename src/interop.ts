import * as cdk from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
import { debug } from '@pulumi/pulumi/log';

export function firstToLower(str: string) {
    return str.replace(/\w\S*/g, function (txt) {
        return txt.charAt(0).toLowerCase() + txt.substr(1);
    });
}

function moduleName(resourceType: string): string {
    const resourceTypeComponents = resourceType.split('::');
    let module = resourceTypeComponents[1];

    // Override the name of the Config module.
    if (module == 'Config') {
        module = 'Configuration';
    }

    return module.toLowerCase();
}

export function normalize(value: any): any {
    if (!value) return value;

    if (Array.isArray(value)) {
        const result: any[] = [];
        for (let i = 0; i < value.length; i++) {
            result[i] = normalize(value[i]);
        }
        return result;
    }

    if (typeof value !== 'object' || pulumi.Output.isInstance(value)) {
        return value;
    }

    const result: any = {};
    Object.entries(value).forEach(([k, v]) => {
        result[firstToLower(k)] = normalize(v);
    });
    return result;
}

export class CdkResource extends pulumi.CustomResource {
    constructor(
        name: string,
        type: string,
        properties: any,
        attributes: string[],
        opts?: pulumi.CustomResourceOptions,
    ) {
        const res = type.split('::')[2];
        const mod = moduleName(type);
        const resourceName = `aws-native:${mod}:${res}`;

        debug(`CdkResource ${resourceName}: ${JSON.stringify(properties)}, ${JSON.stringify(attributes)}`);

        // Prepare an args bag with placeholders for output attributes.
        const args: any = {};
        for (const k of attributes) {
            args[k] = undefined;
        }
        Object.assign(args, properties);

        // console.debug(`CdkResource opts: ${JSON.stringify(opts)}`)
        super(resourceName, name, args, opts);
    }
}

export class CdkComponent extends pulumi.ComponentResource {
    constructor(name: string, args: (stack: cdk.Stack) => void, opts?: pulumi.CustomResourceOptions) {
        super('cdk:index:Component', name, args, opts);

        const app = new cdk.App();
        const stack = new cdk.Stack(app);
        args(stack);

        //debugger;
        const template = app.synth().getStackByName(stack.stackName).template;
        console.debug(`template: ${JSON.stringify(template)}`);
        const resources = template.Resources;

        Object.entries(resources).forEach(([key, value]) => {
            const typeName = (value as any).Type;
            const sourceProps = (value as any).Properties;
            console.debug(`resource[${key}] Type:${typeName} props: ${sourceProps}`);
            opts = opts || { parent: this };
            new CdkResource(key, typeName, normalize(sourceProps), [], opts);
        });
    }
}
