import * as pulumi from '@pulumi/pulumi';
import { Token } from 'aws-cdk-lib';
import { OutputMap } from './output-map';

export function asString<T>(o: pulumi.Output<T>): string {
    return Token.asString(OutputMap.instance().registerOutput(o));
}

export function asNumber<T>(o: pulumi.Output<T>): number {
    return Token.asNumber(OutputMap.instance().registerOutput(o));
}

export function asList<T>(o: pulumi.Output<T>): string[] {
    return Token.asList(OutputMap.instance().registerOutput(o));
}
