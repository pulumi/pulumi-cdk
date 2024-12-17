import * as pulumi from '@pulumi/pulumi';
import { StackConverter } from '../../src/converters/app-converter';
import { parseDynamicSecretReference, parseDynamicValue } from '../../src/converters/dynamic-references';
import * as native from '@pulumi/aws-native';
import { MockAppComponent, promiseOf, setMocks } from '../mocks';
import { StackManifest } from '../../src/assembly';
import { MockResourceArgs } from '@pulumi/pulumi/runtime';

let resources: MockResourceArgs[] = [];
beforeAll(() => {
    resources = [];
    setMocks(resources);
});

describe('parseDynamicSecretReference', () => {
    test('basic', () => {
        expect(parseDynamicSecretReference('{{resolve:secretsmanager:MySecret}}')).toEqual({
            secretId: 'MySecret',
            secretString: undefined,
            jsonKey: undefined,
            versionStage: undefined,
            versionId: undefined,
        });
    });

    test('basic with colons', () => {
        expect(parseDynamicSecretReference('{{resolve:secretsmanager:MySecret::::}}')).toEqual({
            secretId: 'MySecret',
            secretString: undefined,
            jsonKey: undefined,
            versionStage: undefined,
            versionId: undefined,
        });
    });

    test('with secretId as arn and jsonKey', () => {
        expect(
            parseDynamicSecretReference(
                '{{resolve:secretsmanager:arn:aws:secretsmanager:us-east-2:12345678910:secret:teststackInstanceSecret9DA5226D3fdaad7efa858a3daf9490cf0a702aeb-73cc136-zXzZYo:SecretString:password::}}',
            ),
        ).toEqual({
            secretId:
                'arn:aws:secretsmanager:us-east-2:12345678910:secret:teststackInstanceSecret9DA5226D3fdaad7efa858a3daf9490cf0a702aeb-73cc136-zXzZYo',
            secretString: 'SecretString',
            jsonKey: 'password',
            versionStage: undefined,
            versionId: undefined,
        });
    });

    test('with jsonKey and versionStage', () => {
        expect(
            parseDynamicSecretReference('{{resolve:secretsmanager:MySecret:SecretString:password:AWSPREVIOUS}}'),
        ).toEqual({
            secretId: 'MySecret',
            secretString: 'SecretString',
            jsonKey: 'password',
            versionStage: 'AWSPREVIOUS',
            versionId: undefined,
        });
    });

    test('with versionId', () => {
        expect(
            parseDynamicSecretReference('{{resolve:secretsmanager:MySecret:SecretString:password::AWSPREVIOUS}}'),
        ).toEqual({
            secretId: 'MySecret',
            secretString: 'SecretString',
            jsonKey: 'password',
            versionId: 'AWSPREVIOUS',
            versionStage: undefined,
        });
    });
});

describe('process reference value', () => {
    test('string secretsmanager value', async () => {
        const parent = new MockAppComponent('/tmp/foo/bar/does/not/exist');
        const value = parseDynamicValue(parent, '{{resolve:secretsmanager:MySecret}}');
        await expect(pulumi.isSecret(value)).resolves.toBe(true);
        const secretValue = await promiseOf(pulumi.unsecret(value));
        expect(secretValue).toEqual('abcd');
    });

    test('output secretsmanager value', async () => {
        const parent = new MockAppComponent('/tmp/foo/bar/does/not/exist');
        const outputValue = pulumi.output('{{resolve:secretsmanager:MySecret}}');
        const value = parseDynamicValue(parent, outputValue);
        const secretValue = await promiseOf(pulumi.unsecret(value));
        expect(secretValue).toEqual('abcd');
    });

    test('output normal value', async () => {
        const parent = new MockAppComponent('/tmp/foo/bar/does/not/exist');
        const outputValue = pulumi.output('somevalue');
        const value = await promiseOf(parseDynamicValue(parent, outputValue));
        expect(value).toEqual('somevalue');
    });

    test('normal value', async () => {
        const parent = new MockAppComponent('/tmp/foo/bar/does/not/exist');
        const value = parseDynamicValue(parent, 'somevalue');
        expect(value).toEqual('somevalue');
    });
});

describe('SecretsManager tests', () => {
    const stackManifest = (secret: any, json: boolean) => {
        return new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/db': { stackPath: 'stack', id: 'db' },
                'stack/secret': { stackPath: 'stack', id: 'secret' },
            },
            nestedStacks: {},
            tree: {
                path: 'stack',
                id: 'stack',
                children: {
                    db: {
                        id: 'db',
                        path: 'stack/db',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::RDS::DBInstance',
                        },
                    },
                    secret: {
                        id: 'secret',
                        path: 'stack/secret',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::SecretsManager::Secret',
                        },
                    },
                },
                constructInfo: {
                    fqn: 'aws-cdk-lib.Stack',
                    version: '2.149.0',
                },
            },
            template: {
                Resources: {
                    db: {
                        Type: 'AWS::RDS::DBInstance',
                        Properties: {
                            MasterUserSecret: secret,
                        },
                    },
                    secret: {
                        Type: 'AWS::SecretsManager::Secret',
                        Properties: {
                            Description: json ? 'json' : undefined,
                        },
                    },
                },
            },
            dependencies: [],
        });
    };

    test('stack can convert json ref secret', async () => {
        // GIVEN
        const manifest = stackManifest(
            {
                'Fn::Join': [
                    '',
                    [
                        '{{resolve:secretsmanager:',
                        {
                            Ref: 'secret',
                        },
                        ':SecretString:password::}}',
                    ],
                ],
            },
            true,
        );
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);

        // WHEN
        converter.convert(new Set());

        // THEN
        const subnet = converter.resources.get({ stackPath: 'stack', id: 'db' })?.resource as native.rds.DbInstance;
        const cidrBlock = await promiseOf(subnet.masterUserSecret);
        expect(cidrBlock).toEqual('abcd');
    });

    test('stack can convert plain ref secret', async () => {
        // GIVEN
        const manifest = stackManifest(
            {
                'Fn::Join': [
                    '',
                    [
                        '{{resolve:secretsmanager:',
                        {
                            Ref: 'secret',
                        },
                        '}}',
                    ],
                ],
            },
            false,
        );
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);

        // WHEN
        converter.convert(new Set());

        // THEN
        const subnet = converter.resources.get({ stackPath: 'stack', id: 'db' })?.resource as native.rds.DbInstance;
        const cidrBlock = await promiseOf(subnet.masterUserSecret);
        expect(cidrBlock).toEqual('abcd');
    });

    test('stack can convert plain secret', async () => {
        // GIVEN
        const manifest = stackManifest('{{resolve:secretsmanager:secret}}', false);
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);

        // WHEN
        converter.convert(new Set());

        // THEN
        const subnet = converter.resources.get({ stackPath: 'stack', id: 'db' })?.resource as native.rds.DbInstance;
        const cidrBlock = await promiseOf(subnet.masterUserSecret);
        expect(cidrBlock).toEqual('abcd');
    });

    test('stack can convert plain secret json', async () => {
        // GIVEN
        const manifest = stackManifest('{{resolve:secretsmanager:json:SecretString:password::}}', true);
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);

        // WHEN
        converter.convert(new Set());

        // THEN
        const subnet = converter.resources.get({ stackPath: 'stack', id: 'db' })?.resource as native.rds.DbInstance;
        const cidrBlock = await promiseOf(subnet.masterUserSecret);
        expect(cidrBlock).toEqual('abcd');
    });
});
