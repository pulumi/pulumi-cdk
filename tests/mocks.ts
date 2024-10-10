import * as pulumi from '@pulumi/pulumi';
import { MockCallArgs, MockResourceArgs } from '@pulumi/pulumi/runtime';

// Convert a pulumi.Output to a promise of the same type.
export function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise((resolve) => output.apply(resolve));
}

export function setMocks(assertFn: (args: MockResourceArgs) => void) {
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
                    assertFn(args);
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
