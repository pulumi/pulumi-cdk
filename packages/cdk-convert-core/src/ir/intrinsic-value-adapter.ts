import { IntrinsicValueAdapter, ResourceAttributeRequest } from '../converters/intrinsic-value-adapter';
import { ConcatValue, PropertyValue, ResourceAttributeReference } from '../ir';
import { attributePropertyName, toSdkName } from '../naming';
import { Metadata, PulumiResource } from '../metadata';
import { PulumiProvider } from '../providers';

export interface ResourceMetadataProvider {
    tryFindResource(cfnType: string): PulumiResource | undefined;
}

/**
 * Intrinsic value adapter that emits IR-friendly references instead of Pulumi Outputs.
 */
export class IrIntrinsicValueAdapter implements IntrinsicValueAdapter<any, PropertyValue> {
    private readonly metadata: ResourceMetadataProvider;

    constructor(metadata?: ResourceMetadataProvider) {
        this.metadata = metadata ?? new Metadata(PulumiProvider.AWS_NATIVE);
    }

    getResourceAttribute(request: ResourceAttributeRequest<any, PropertyValue>): PropertyValue {
        const { mapping, attribute } = request;

        const override = mapping.attributes?.[attribute];
        if (override !== undefined) {
            return override;
        }

        if (attribute === 'Ref') {
            return this.resolveRefAttribute(request);
        }

        return this.makePropertyReference(request, attribute, this.getDefaultPropertyName(mapping, attribute));
    }

    private resolveRefAttribute(request: ResourceAttributeRequest<any, PropertyValue>): PropertyValue {
        const meta = this.metadata.tryFindResource(request.mapping.resourceType);
        const cfRef = meta?.cfRef;

        if (!cfRef || cfRef.notSupportedYet) {
            return this.makePropertyReference(request, 'Ref', 'id');
        }

        if (cfRef.notSupported) {
            throw new Error(`Ref intrinsic is not supported for the ${request.mapping.resourceType} resource type`);
        }

        const propertyNames = new Set<string>();
        if (cfRef.property) {
            propertyNames.add(cfRef.property);
        }
        for (const prop of cfRef.properties ?? []) {
            propertyNames.add(prop);
        }

        if (propertyNames.size === 0) {
            return this.makePropertyReference(request, 'Ref', 'id');
        }

        const references = Array.from(propertyNames).map((prop) =>
            this.makePropertyReference(request, 'Ref', toSdkName(prop)),
        );

        if (references.length === 1) {
            return references[0];
        }

        return <ConcatValue>{
            kind: 'concat',
            delimiter: cfRef.delimiter ?? '|',
            values: references,
        };
    }

    private makePropertyReference(
        request: ResourceAttributeRequest<any, PropertyValue>,
        attribute: string,
        propertyName: string,
    ): ResourceAttributeReference {
        return {
            kind: 'resourceAttribute',
            resource: request.resourceAddress,
            attributeName: attribute,
            propertyName,
        };
    }

    private getDefaultPropertyName(mapping: ResourceAttributeRequest<any, PropertyValue>['mapping'], attribute: string): string {
        if (mapping.attributes !== undefined) {
            return attribute;
        }
        return attributePropertyName(attribute);
    }
}
