import { StackAddress } from '../assembly';
import { Mapping } from './mapping';

export interface ResourceAttributeRequest<TResource = any, TValue = any> {
    mapping: Mapping<TResource, TValue>;
    attribute: string;
    propertyName: string;
    resourceAddress: StackAddress;
}

export interface IntrinsicValueAdapter<TResource = any, TValue = any> {
    getResourceAttribute(request: ResourceAttributeRequest<TResource, TValue>): TValue;
}
