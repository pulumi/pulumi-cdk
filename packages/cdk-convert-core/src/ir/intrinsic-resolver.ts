import { CloudFormationTemplate, CloudFormationResource } from '../cfn';
import { IntrinsicValueAdapter } from '../converters/intrinsic-value-adapter';
import { Mapping } from '../converters/mapping';
import {
    PropertyMap,
    PropertyValue,
    StackOutputReference,
    ParameterReference,
    ConcatValue,
    DynamicReferenceValue,
} from '../ir';
import { StackAddress } from '../assembly';
import { tryParseDynamicReference } from './dynamic-references';

export interface IrIntrinsicResolverProps {
    stackPath: string;
    template: CloudFormationTemplate;
    adapter: IntrinsicValueAdapter<any, PropertyValue>;
}

type ConditionExpression = any;

export class IrIntrinsicResolver {
    private readonly stackPath: string;
    private readonly template: CloudFormationTemplate;
    private readonly adapter: IntrinsicValueAdapter<any, PropertyValue>;
    private readonly conditionCache = new Map<string, boolean>();

    constructor(props: IrIntrinsicResolverProps) {
        this.stackPath = props.stackPath;
        this.template = props.template;
        this.adapter = props.adapter;
    }

    resolvePropertyMap(props: { [key: string]: any } | undefined): PropertyMap {
        const result: PropertyMap = {};
        if (!props) {
            return result;
        }

        for (const [key, value] of Object.entries(props)) {
            if (isNoValueIntrinsic(value)) {
                continue;
            }
            const resolved = this.resolveValue(value);
            if (resolved !== undefined) {
                result[key] = resolved;
            }
        }

        return result;
    }

    resolveValue(value: any): PropertyValue | undefined {
        if (value === null || value === undefined) {
            return value as null | undefined;
        }

        if (Array.isArray(value)) {
            const resolvedItems = value
                .filter((item) => !isNoValueIntrinsic(item))
                .map((item) => this.resolveValue(item))
                .filter((item): item is PropertyValue => item !== undefined);
            return resolvedItems;
        }

        if (typeof value === 'string') {
            const dynamicReference = tryParseDynamicReference(value);
            if (dynamicReference) {
                return dynamicReference;
            }
            return value;
        }

        if (typeof value !== 'object') {
            return value;
        }

        if (isRef(value)) {
            return this.resolveRef(value.Ref);
        }

        if (isGetAtt(value)) {
            return this.resolveGetAtt(value['Fn::GetAtt']);
        }

        if (isIf(value)) {
            return this.resolveIf(value['Fn::If']);
        }

        if (isJoin(value)) {
            return this.resolveJoin(value['Fn::Join']);
        }

        if (isSplit(value)) {
            return this.resolveSplit(value['Fn::Split']);
        }

        if (isConditionFunction(value)) {
            return this.resolveConditionFunction(value);
        }

        const entries = Object.entries(value);
        const result: PropertyMap = {};
        for (const [key, val] of entries) {
            if (isNoValueIntrinsic(val)) {
                continue;
            }
            const resolved = this.resolveValue(val);
            if (resolved !== undefined) {
                result[key] = resolved;
            }
        }
        return result;
    }

    private resolveRef(logicalId: string): PropertyValue | undefined {
        if (logicalId === 'AWS::NoValue') {
            return undefined;
        }

        if (this.template.Parameters?.[logicalId]) {
            return <ParameterReference>{
                kind: 'parameter',
                stackPath: this.stackPath,
                parameterName: logicalId,
            };
        }

        if (this.template.Outputs?.[logicalId]) {
            return <StackOutputReference>{
                kind: 'stackOutput',
                stackPath: this.stackPath,
                outputName: logicalId,
            };
        }

        const resource = this.template.Resources?.[logicalId];
        if (!resource) {
            return undefined;
        }

        return this.adapter.getResourceAttribute({
            mapping: makeMapping(resource, logicalId),
            attribute: 'Ref',
            propertyName: 'Ref',
            resourceAddress: this.makeAddress(logicalId),
        });
    }

    private resolveGetAtt(params: [string, string]): PropertyValue | undefined {
        const [logicalId, attribute] = params;
        const resource = this.template.Resources?.[logicalId];
        if (!resource) {
            return undefined;
        }

        return this.adapter.getResourceAttribute({
            mapping: makeMapping(resource, logicalId),
            attribute,
            propertyName: attribute,
            resourceAddress: this.makeAddress(logicalId),
        });
    }

    private resolveJoin(params: [string, any[]]): PropertyValue | undefined {
        const [delimiter, items] = params;
        const resolvedItems = items
            .filter((item) => !isNoValueIntrinsic(item))
            .map((item) => this.resolveValue(item))
            .filter((item): item is PropertyValue => item !== undefined);

        if (resolvedItems.every((item) => typeof item === 'string')) {
            return (resolvedItems as string[]).join(delimiter);
        }

        return <ConcatValue>{
            kind: 'concat',
            delimiter,
            values: resolvedItems,
        };
    }

    private resolveSplit(params: [string, any]): PropertyValue | undefined {
        const [delimiter, source] = params;
        const resolvedSource = this.resolveValue(source);
        if (typeof resolvedSource !== 'string') {
            return undefined;
        }
        return resolvedSource.split(delimiter);
    }

    private resolveIf(params: [string, any, any]): PropertyValue | undefined {
        const [conditionName, thenValue, elseValue] = params;
        const result = this.evaluateConditionByName(conditionName);
        if (result) {
            return this.resolveValue(thenValue);
        }
        return this.resolveValue(elseValue);
    }

    private resolveConditionFunction(value: any): PropertyValue | undefined {
        if (value['Fn::Equals']) {
            return this.evaluateEquals(value['Fn::Equals']);
        }
        if (value['Fn::Or']) {
            return this.evaluateOr(value['Fn::Or']);
        }
        if (value['Fn::And']) {
            return this.evaluateAnd(value['Fn::And']);
        }
        if (value['Fn::Not']) {
            return this.evaluateNot(value['Fn::Not']);
        }
        return undefined;
    }

    private evaluateEquals(params: [any, any]): boolean {
        const left = this.resolveValue(params[0]);
        const right = this.resolveValue(params[1]);
        return deepEquals(left, right);
    }

    private evaluateAnd(params: any[]): boolean {
        if (params.length < 2 || params.length > 10) {
            throw new Error('Fn::And requires between 2 and 10 arguments');
        }
        return params.every((expr) => this.evaluateConditionExpression(expr));
    }

    private evaluateOr(params: any[]): boolean {
        if (params.length < 2 || params.length > 10) {
            throw new Error('Fn::Or requires between 2 and 10 arguments');
        }
        return params.some((expr) => this.evaluateConditionExpression(expr));
    }

    private evaluateNot(params: [any]): boolean {
        if (params.length !== 1) {
            throw new Error('Fn::Not requires exactly 1 argument');
        }
        return !this.evaluateConditionExpression(params[0]);
    }

    private evaluateConditionByName(name: string): boolean {
        if (this.conditionCache.has(name)) {
            return this.conditionCache.get(name)!;
        }

        const expr = this.template.Conditions?.[name];
        if (expr === undefined) {
            throw new Error(`Unable to find condition ${name}`);
        }

        const result = this.evaluateConditionExpression(expr);
        this.conditionCache.set(name, result);
        return result;
    }

    private evaluateConditionExpression(expr: ConditionExpression): boolean {
        if (typeof expr === 'boolean') {
            return expr;
        }

        if (typeof expr === 'string') {
            return this.evaluateConditionByName(expr);
        }

        if (Array.isArray(expr)) {
            return expr.every((item) => this.evaluateConditionExpression(item));
        }

        if (typeof expr !== 'object' || expr === null) {
            return false;
        }

        if (isRef(expr)) {
            const resolved = this.resolveRef(expr.Ref);
            if (typeof resolved === 'string') {
                return resolved.length > 0;
            }
            return resolved !== undefined && resolved !== null;
        }

        if (isEquals(expr)) {
            return this.evaluateEquals(expr['Fn::Equals']);
        }
        if (isAnd(expr)) {
            return this.evaluateAnd(expr['Fn::And']);
        }
        if (isOr(expr)) {
            return this.evaluateOr(expr['Fn::Or']);
        }
        if (isNot(expr)) {
            return this.evaluateNot(expr['Fn::Not']);
        }

        if (isIf(expr)) {
            return this.resolveIf(expr['Fn::If']) ? true : false;
        }

        return false;
    }

    private makeAddress(logicalId: string): StackAddress {
        return {
            id: logicalId,
            stackPath: this.stackPath,
        };
    }
}

function isRef(value: any): value is { Ref: string } {
    return typeof value === 'object' && value !== null && typeof value.Ref === 'string';
}

function isGetAtt(value: any): value is { 'Fn::GetAtt': [string, string] } {
    return (
        typeof value === 'object' &&
        value !== null &&
        Array.isArray(value['Fn::GetAtt']) &&
        value['Fn::GetAtt'].length === 2
    );
}

function isIf(value: any): value is { 'Fn::If': [string, any, any] } {
    return typeof value === 'object' && value !== null && Array.isArray(value['Fn::If']) && value['Fn::If'].length === 3;
}

function isJoin(value: any): value is { 'Fn::Join': [string, any[]] } {
    return (
        typeof value === 'object' &&
        value !== null &&
        Array.isArray(value['Fn::Join']) &&
        value['Fn::Join'].length === 2 &&
        Array.isArray(value['Fn::Join'][1])
    );
}

function isSplit(value: any): value is { 'Fn::Split': [string, any] } {
    return typeof value === 'object' && value !== null && Array.isArray(value['Fn::Split']) && value['Fn::Split'].length === 2;
}

function isEquals(value: any): value is { 'Fn::Equals': [any, any] } {
    return typeof value === 'object' && value !== null && Array.isArray(value['Fn::Equals']) && value['Fn::Equals'].length === 2;
}

function isAnd(value: any): value is { 'Fn::And': any[] } {
    return typeof value === 'object' && value !== null && Array.isArray(value['Fn::And']);
}

function isOr(value: any): value is { 'Fn::Or': any[] } {
    return typeof value === 'object' && value !== null && Array.isArray(value['Fn::Or']);
}

function isNot(value: any): value is { 'Fn::Not': [any] } {
    return typeof value === 'object' && value !== null && Array.isArray(value['Fn::Not']);
}

function isConditionFunction(value: any): boolean {
    return isEquals(value) || isAnd(value) || isOr(value) || isNot(value);
}

function isNoValueIntrinsic(value: any): boolean {
    return typeof value === 'object' && value !== null && value.Ref === 'AWS::NoValue';
}

function makeMapping(resource: CloudFormationResource, logicalId: string): Mapping<any, PropertyValue> {
    return {
        resource: { logicalId },
        resourceType: resource.Type,
    };
}

function deepEquals(left: PropertyValue | undefined, right: PropertyValue | undefined): boolean {
    if (left === right) {
        return true;
    }

    if (left === undefined || right === undefined) {
        return false;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) {
            return false;
        }
        return left.every((item, idx) => deepEquals(item as PropertyValue, right[idx] as PropertyValue));
    }

    if (isObject(left) && isObject(right)) {
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        if (leftKeys.length !== rightKeys.length) {
            return false;
        }
        return leftKeys.every((key) => deepEquals((left as any)[key], (right as any)[key]));
    }

    return false;
}

function isObject(value: any): value is object {
    return typeof value === 'object' && value !== null;
}
