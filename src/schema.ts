import { Stack, Token } from 'aws-cdk-lib';
import * as path from 'path';
import * as fs from 'fs';
import { debug } from 'console';
export type SchemaInfos = IdentifierInfo[];
export enum IdentifierType {
    INPUT = 'INPUT',
    OUTPUT = 'OUTPUT',
}
export interface IdentifierInfo {
    identifierType: IdentifierType;
    name: string;
}

export interface ImportSpec {
    type: string;
    name: string;
    id: string;
    parent: string;

    lookupId?: PropertyId[];
}

export interface ImportFile {
    resources: ImportSpec[];
}

export class Importer {
    private cfnTypes: Map<string, IdentifierInfo[]>;
    private importFile: ImportFile;
    constructor() {
        const contents = fs.readFileSync('/Users/chall/work/pulumi-cdk-importer/corymhall/hackweek/cfn-schema.json', {
            encoding: 'utf-8',
        });
        this.cfnTypes = new Map(Object.entries(JSON.parse(contents)));
        this.importFile = {
            resources: [],
        };
    }

    public writeImportFile(): void {
        const file = path.join(process.cwd(), 'import-file.json');
        fs.writeFileSync(file, JSON.stringify(this.importFile, undefined, 2));
    }

    public processResource(stack: Stack, parent: string, logicalId: string, cfnType: string, properties: any) {
        const typeInfo = this.cfnTypes.get(cfnType);
        if (!typeInfo) {
            // TODO: this shouldn't happen
            return;
        }
        if (!typeInfo || typeInfo.length === 0) {
            return;
        }

        console.error(logicalId, cfnType, properties, typeInfo);

        const lookups: PropertyId[] = [];
        typeInfo.forEach((info) => {
            if (!properties) {
                lookups.push({
                    logicalId,
                    propertyRefName: info.name,
                    idPropertyName: info.name,
                });
                return;
            }
            if (info.name in properties && properties[info.name] !== undefined) {
                const propInfo = this.findPropertyValue(stack, properties[info.name]);
                if (propInfo.ref) {
                    lookups.push({
                        ...propInfo.ref,
                        idPropertyName: info.name,
                    });
                }
            } else {
                lookups.push({
                    logicalId,
                    propertyRefName: info.name,
                    idPropertyName: info.name,
                });
            }
            return;
        });
        this.importFile.resources.push({
            name: logicalId,
            id: '<PLACEHOLDER>',
            type: cfnType,
            parent,
            lookupId: lookups,
        });
    }

    private findPropertyValue(stack: Stack, property: any): PropertyInfo {
        if (typeof property === 'string') {
            if (Token.isUnresolved(property)) {
                return {
                    value: stack.resolve(property),
                };
            }
        }
        if (typeof property !== 'object') {
            return {
                value: property,
            };
        }
        // TODO: It's probably not going to be an array
        if (Array.isArray(property)) {
            throw new Error('Error property was an array');
        }

        const ref = property.Ref;
        if (ref) {
            const logicalId = this.resolveRef(ref);
            return {
                ref: {
                    propertyRefName: 'Id',
                    logicalId,
                    idPropertyName: '',
                },
            };
        }

        const keys = Object.keys(property);
        if (keys.length === 1 && keys[0]?.startsWith('Fn::')) {
            return this.resolveIntrinsic(keys[0], property[keys[0]]);
        }

        // TODO: Validate that we shouldn't get here
        throw new Error('Could not find property');
    }

    /**
     * @property target the ref target, which should be the logicalId of a resource
     * @returns the logicalId of the resource being referenced
     */
    private resolveRef(target: any): string {
        if (typeof target !== 'string') {
            // TODO:
            // return this.resolveOutput(<OutputRepr>target);
        }

        // It should be safe to assume that we are refing another resource which means
        // the 'target' is a resource logicalId
        return target;
    }

    private resolveIntrinsic(fn: string, params: any): PropertyInfo {
        switch (fn) {
            // TODO: For now only look at GetAtt. My assumption is that most ids will only be made up of
            // Refs and GetAtts
            case 'Fn::GetAtt': {
                debug(`Fn::GetAtt(${params[0]}, ${params[1]})`);
                const logicalId = params[0];
                const propertyName = params[1];
                return {
                    ref: {
                        logicalId,
                        propertyRefName: propertyName,
                        idPropertyName: '',
                    },
                };
            }
            default:
                throw new Error(`unsupported intrinsic function ${fn} for ids`);
        }
    }

    // private resolveOutput() {
    //     return;
    // }
}

export interface PropertyInfo {
    value?: string;
    ref?: PropertyId;
}

export interface PropertyId extends PropertyRef {
    // The name of the id property
    idPropertyName: string;
}
export interface PropertyRef {
    logicalId: string;

    // the name of the property that is being referenced
    propertyRefName: string;
}
