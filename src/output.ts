import * as pulumi from '@pulumi/pulumi';
import { Token } from 'aws-cdk-lib';
import { OutputMap } from './output-map';

/**
 * Convert a Pulumi Output to a CDK string value.
 *
 * @param o A Pulumi Output value which represents a string.
 * @returns A CDK token representing a string value.
 */
export function asString<T>(o: pulumi.Output<T>): string {
    return Token.asString(OutputMap.instance().registerOutput(o));
}

/**
 * Convert a Pulumi Output to a CDK number value.
 *
 * @param o A Pulumi Output value which represents a number.
 * @returns A CDK token representing a number value.
 */
export function asNumber<T>(o: pulumi.Output<T>): number {
    return Token.asNumber(OutputMap.instance().registerOutput(o));
}

/**
 * Convert a Pulumi Output to a list of CDK values.
 *
 * @param o A Pulumi Output value which represents a list.
 * @returns A CDK token representing a list of values.
 */
export function asList<T>(o: pulumi.Output<T>): string[] {
    return Token.asList(OutputMap.instance().registerOutput(o));
}
