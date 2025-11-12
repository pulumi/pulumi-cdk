import { IntrinsicValueAdapter, ResourceAttributeRequest } from '../converters/intrinsic-value-adapter';
import { PropertyValue, ResourceAttributeReference } from '../ir';
import { attributePropertyName } from '../naming';

/**
 * Intrinsic value adapter that emits IR-friendly references instead of Pulumi Outputs.
 */
export class IrIntrinsicValueAdapter implements IntrinsicValueAdapter<any, PropertyValue> {
    getResourceAttribute(request: ResourceAttributeRequest<any, PropertyValue>): PropertyValue {
        const { mapping, attribute } = request;

        const override = mapping.attributes?.[attribute];
        if (override !== undefined) {
            return override;
        }

        return <ResourceAttributeReference>{
            kind: 'resourceAttribute',
            resource: request.resourceAddress,
            attributeName: attribute,
            propertyName: mapping.attributes !== undefined ? attribute : attributePropertyName(attribute),
        };
    }
}
