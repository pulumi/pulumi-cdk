import * as pulumi from '@pulumi/pulumi';
import { MockCallArgs, MockResourceArgs } from '@pulumi/pulumi/runtime';
import { Construct } from 'constructs';
import { App, Stack } from '../src/stack';

// Convert a pulumi.Output to a promise of the same type.
export function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise((resolve) => output.apply(resolve));
}

export async function testApp(fn: (scope: Construct) => void) {
    class TestStack extends Stack {
        constructor(app: App, id: string) {
            super(app, id, {
                props: {
                    env: {
                        region: 'us-east-1',
                        account: '12345678912',
                    },
                },
            });

            fn(this);
        }

        get availabilityZones(): string[] {
            return ['us-east-1a', 'us-east-1b'];
        }
    }

    const app = new App('testapp', (scope: App) => {
        new TestStack(scope, 'teststack');
    });
    const converter = await app.converter;
    await Promise.all(
        Array.from(converter.stacks.values()).flatMap((stackConverter) => {
            return Array.from(stackConverter.constructs.values()).flatMap((v) => promiseOf(v.urn));
        }),
    );
    await promiseOf(app.urn);
    await Promise.all(app.dependencies.flatMap((d) => promiseOf(d.urn)));
}

export function setMocks(resources?: MockResourceArgs[]) {
    const mocks: pulumi.runtime.Mocks = {
        call: (args: MockCallArgs): { [id: string]: any } => {
            switch (args.token) {
                case 'aws-native:index:getAccountId':
                    return {
                        accountId: '12345678910',
                    };
                case 'aws-native:index:getRegion':
                    return {
                        region: 'us-east-2',
                    };
                case 'aws-native:index:getPartition':
                    return {
                        partition: 'aws',
                    };
                case 'aws-native:index:getAzs':
                    return {
                        azs: ['us-east-1a', 'us-east-1b'],
                    };
                case 'aws:index/getCallerIdentity:getCallerIdentity':
                    return {
                        accountId: '12345678910',
                    };
                case 'aws:index/getRegion:getRegion':
                    return {
                        name: 'us-east-2',
                    };
                default:
                    return {};
            }
        },
        newResource: (args: MockResourceArgs): { id: string; state: any } => {
            switch (args.type) {
                case 'cdk:index:App':
                    return { id: '', state: {} };
                case 'cdk:index:Stack':
                    return { id: '', state: {} };
                case 'cdk:construct:TestStack':
                    return { id: '', state: {} };
                case 'cdk:construct:teststack':
                    return { id: '', state: {} };
                case 'cdk:index:Component':
                    return { id: '', state: {} };
                default:
                    resources?.push(args);
                    return {
                        id: args.name + '_id',
                        state: {
                            ...args.inputs,
                            arn: args.name + '_arn',
                        },
                    };
            }
        },
    };

    pulumi.runtime.setMocks(mocks, 'project', 'stack', false);
}
