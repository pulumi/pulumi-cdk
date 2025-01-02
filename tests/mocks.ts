import * as pulumi from '@pulumi/pulumi';
import { CdkConstruct } from '../src/interop';
import {
    Stack as CdkStack,
    DockerImageAssetLocation,
    DockerImageAssetSource,
    FileAssetLocation,
    FileAssetSource,
    ISynthesisSession,
} from 'aws-cdk-lib/core';
import { AppComponent, AppOptions, AppResourceOptions } from '../src/types';
import { MockCallArgs, MockCallResult, MockResourceArgs } from '@pulumi/pulumi/runtime';
import { Construct } from 'constructs';
import { App, Stack } from '../src/stack';
import { PulumiSynthesizerBase } from '../src/synthesizer';
import { toSdkName } from '../src/naming';

// Convert a pulumi.Output to a promise of the same type.
export function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
    return new Promise((resolve) => output.apply(resolve));
}

export class MockAppComponent extends pulumi.ComponentResource implements AppComponent {
    public readonly name = 'stack';
    public readonly assemblyDir: string;
    stacks: { [artifactId: string]: CdkStack } = {};
    stackOptions: { [artifactId: string]: pulumi.ComponentResourceOptions } = {};
    dependencies: CdkConstruct[] = [];

    component: pulumi.ComponentResource;
    public stack: Stack;
    public appOptions?: AppOptions | undefined;
    constructor(dir: string) {
        super('cdk:index:App', 'stack');
        this.assemblyDir = dir;
        this.registerOutputs();
    }
}

export async function testApp(fn: (scope: Construct) => void, options?: AppResourceOptions, withEnv?: boolean) {
    const env = withEnv ? { account: '12345678912', region: 'us-east-1' } : undefined;
    class TestStack extends Stack {
        constructor(app: App, id: string) {
            super(app, id, {
                props: {
                    env,
                },
            });

            fn(this);
        }

        get availabilityZones(): string[] {
            return ['us-east-1a', 'us-east-1b'];
        }
    }

    const app = new App(
        'testapp',
        (scope: App) => {
            new TestStack(scope, 'teststack');
        },
        {
            ...options,
        },
    );
    await awaitApp(app);
}

export async function awaitApp(app: App): Promise<void> {
    const converter = await app.converter;
    await Promise.all(
        Array.from(converter.stacks.values()).flatMap((stackConverter) => {
            return Array.from(stackConverter.constructs.values()).flatMap((v) => promiseOf(v.urn));
        }),
    );
    await promiseOf(app.urn);
    await Promise.all(app.dependencies.flatMap((d) => promiseOf(d.urn)));
}

export function setMocks(resources?: MockResourceArgs[], overrides?: { [pulumiType: string]: MockCallResult }) {
    const mocks: pulumi.runtime.Mocks = {
        call: (args: MockCallArgs): { [id: string]: any } => {
            if (overrides && args.token in overrides) {
                return overrides[args.token];
            }
            switch (args.token) {
                case 'aws-native:index:getAccountId':
                    return {
                        accountId: '12345678910',
                    };
                case 'aws-native:index:getRegion':
                    if (args.provider?.includes('custom-region')) {
                        return {
                            region: args.provider,
                        };
                    }
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
                case 'aws:index/getPartition:getPartition':
                    return {
                        partition: 'aws',
                    };
                case 'aws:index/getRegion:getRegion':
                    return {
                        name: 'us-east-2',
                    };
                case 'aws:ssm/getParameter:getParameter':
                    return {
                        type: 'String',
                        value: 'abcd',
                    };
                case 'aws:secretsmanager/getSecretVersion:getSecretVersion':
                    return {
                        secretString: args.inputs.secretId.startsWith('json')
                            ? JSON.stringify({
                                  password: 'abcd',
                              })
                            : 'abcd',
                    };
                case 'aws:ecr/getCredentials:getCredentials':
                    return {
                        authorizationToken: btoa('user:password'),
                        proxyEndpoint: 'https://12345678910.dkr.ecr.us-east-1.amazonaws.com',
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
                case 'docker-build:index:Image':
                    resources?.push(args);
                    return {
                        id: args.inputs.name + '_id',
                        state: {
                            ...args.inputs,
                            id: args.inputs.name + '_id',
                            ref: args.inputs.tags[0] + '@sha256:abcdefghijk1023',
                        },
                    };
                case 'aws:ecr/repository:Repository': {
                    resources?.push(args);
                    return {
                        id: args.name + '_id',
                        state: {
                            ...args.inputs,
                            arn: args.name + '_arn',
                            repositoryUrl: '12345678910.dkr.ecr.us-east-1.amazonaws.com/' + args.name,
                        },
                    };
                }
                case 'aws-native:cloudformation:CustomResourceEmulator':
                    resources?.push(args);
                    return {
                        id: args.inputs.logicalId + '_id',
                        state: {
                            ...args.inputs,
                            id: args.inputs.logicalId + '_id',
                            data: {
                                DestinationBucketArn: `arn:aws:s3:::${args.inputs.bucketName}`,
                            },
                        },
                    };
                case 'aws-native:s3:Bucket':
                    resources?.push(args);
                    return {
                        id: args.name + '_id',
                        state: {
                            ...args.inputs,
                            id: args.name + '_id',
                            arn: args.name + '_arn',
                            bucketName: args.inputs?.bucketName ?? args.name + '_name',
                        },
                    };
                default: {
                    resources?.push(args);
                    const attrName = args.type.split(':')[2];
                    const sdkName = toSdkName(attrName);
                    const id = args.inputs.description ?? args.name;
                    return {
                        id: id + '_id',
                        state: {
                            ...args.inputs,
                            id: id + '_id',
                            arn: id + '_arn',
                            [sdkName + 'Arn']: id + '_arn',
                            [sdkName + 'Id']: id + '_id',
                            [sdkName + 'Name']: id + '_name',
                        },
                    };
                }
            }
        },
    };

    pulumi.runtime.setMocks(mocks, 'project', 'stack', false);
}

export class MockSynth extends PulumiSynthesizerBase {
    constructor(readonly bucket: string, readonly prefix: string) {
        super();
    }
    public stagingStack: CdkConstruct;
    public getStagingBucket(): pulumi.Input<string> {
        return this.bucket;
    }
    public getDeployTimePrefix(): string {
        return this.prefix;
    }

    addFileAsset(asset: FileAssetSource): FileAssetLocation {
        throw new Error('Method not implemented.');
    }
    addDockerImageAsset(asset: DockerImageAssetSource): DockerImageAssetLocation {
        throw new Error('Method not implemented.');
    }
    synthesize(session: ISynthesisSession): void {
        throw new Error('Method not implemented.');
    }
}
