import * as pulumi from '@pulumi/pulumi';
import { StackConverter } from '../../src/converters/app-converter';
import {
    parseDynamicValue,
    parseSSMDynamicSecureStringReference,
    parseSSMDynamicPlaintextReference,
} from '../../src/converters/dynamic-references';
import * as native from '@pulumi/aws-native';
import { MockAppComponent, promiseOf, setMocks } from '../mocks';
import { StackManifest } from '../../src/assembly';
import { MockResourceArgs } from '@pulumi/pulumi/runtime';

let resources: MockResourceArgs[] = [];
beforeEach(() => {
    resources = [];
    setMocks(resources);
});

describe('parseSSMDynamicPlaintextReference', () => {
    test('without version', () => {
        expect(parseSSMDynamicPlaintextReference('{{resolve:ssm:MySecret}}')).toEqual({
            parameterName: 'MySecret',
        });
    });

    test('with version', () => {
        expect(parseSSMDynamicPlaintextReference('{{resolve:ssm:MySecret:1}}')).toEqual({
            parameterName: 'MySecret:1',
        });
    });
});

describe('parseSSMDynamicSecureStringReference', () => {
    test('without version', () => {
        expect(parseSSMDynamicSecureStringReference('{{resolve:ssm-secure:MySecret}}')).toEqual({
            parameterName: 'MySecret',
        });
    });

    test('with version', () => {
        expect(parseSSMDynamicSecureStringReference('{{resolve:ssm-secure:MySecret:1}}')).toEqual({
            parameterName: 'MySecret:1',
        });
    });
});

describe('process reference value', () => {
    test('string ssm value', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources, {
            'aws:ssm/getParameter:getParameter': {
                type: 'String',
                value: 'abcd',
            },
        });
        const parent = new MockAppComponent('/tmp/foo/bar/does/not/exist');
        const value = parseDynamicValue(parent, '{{resolve:ssm:MySecret}}');
        await expect(pulumi.isSecret(value)).resolves.toBe(false);
        const paramValue = await promiseOf(pulumi.unsecret(value));
        expect(paramValue).toEqual('abcd');
    });

    test('StringList ssm value', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources, {
            'aws:ssm/getParameter:getParameter': {
                type: 'StringList',
                value: 'abcd,efgh',
            },
        });
        const parent = new MockAppComponent('/tmp/foo/bar/does/not/exist');
        const value = parseDynamicValue(parent, '{{resolve:ssm:MySecret}}');
        await expect(pulumi.isSecret(value)).resolves.toBe(false);
        const paramValue = await promiseOf(pulumi.unsecret(value));
        expect(paramValue).toEqual('abcd,efgh');
    });

    test('SecureString value', async () => {
        const resources: MockResourceArgs[] = [];
        setMocks(resources, {
            'aws:ssm/getParameter:getParameter': {
                type: 'SecureString',
                value: 'abcd',
            },
        });
        const parent = new MockAppComponent('/tmp/foo/bar/does/not/exist');
        const value = parseDynamicValue(parent, '{{resolve:ssm-secure:MySecret}}');
        await expect(pulumi.isSecret(value)).resolves.toBe(true);
        const paramValue = await promiseOf(pulumi.unsecret(value));
        expect(paramValue).toEqual('abcd');
    });
});

describe('SSM tests', () => {
    const stackManifest = (secret: any) => {
        return new StackManifest({
            id: 'stack',
            templatePath: 'test/stack',
            metadata: {
                'stack/db': { stackPath: 'stack', id: 'db' },
                'stack/param': { stackPath: 'stack', id: 'param' },
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
                    param: {
                        id: 'param',
                        path: 'stack/param',
                        attributes: {
                            'aws:cdk:cloudformation:type': 'AWS::SSM::Parameter',
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
                    param: {
                        Type: 'AWS::SSM::Parameter',
                        Properties: {
                            Name: 'param',
                            Type: 'String',
                            Value: 'abcd',
                        },
                    },
                },
            },
            dependencies: [],
        });
    };

    test('stack can convert ssm String value with Ref', async () => {
        // GIVEN
        const manifest = stackManifest({
            'Fn::Join': [
                '',
                [
                    '{{resolve:ssm:',
                    {
                        Ref: 'param',
                    },
                    '}}',
                ],
            ],
        });
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);

        // WHEN
        converter.convert(new Set());

        // THEN
        const subnet = converter.resources.get({ stackPath: 'stack', id: 'db' })?.resource as native.rds.DbInstance;
        const cidrBlock = await promiseOf(subnet.masterUserSecret);
        expect(cidrBlock).toEqual('abcd');
    });

    test('stack can convert ssm String value', async () => {
        // GIVEN
        const manifest = stackManifest('{{resolve:ssm:secret}}');
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);

        // WHEN
        converter.convert(new Set());

        // THEN
        const subnet = converter.resources.get({ stackPath: 'stack', id: 'db' })?.resource as native.rds.DbInstance;
        const cidrBlock = await promiseOf(subnet.masterUserSecret);
        expect(cidrBlock).toEqual('abcd');
    });

    test('stack can convert ssm SecureString value', async () => {
        // GIVEN
        const resources: MockResourceArgs[] = [];
        setMocks(resources, {
            'aws:ssm/getParameter:getParameter': {
                type: 'SecureString',
                value: 'abcd',
            },
        });
        const manifest = stackManifest('{{resolve:ssm-secure:secret}}');
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);

        // WHEN
        converter.convert(new Set());

        // THEN
        const subnet = converter.resources.get({ stackPath: 'stack', id: 'db' })?.resource as native.rds.DbInstance;
        const value = await promiseOf(subnet.masterUserSecret);
        expect(value).toEqual('abcd');
    });

    test('stack can convert ssm StringList value', async () => {
        // GIVEN
        const resources: MockResourceArgs[] = [];
        setMocks(resources, {
            'aws:ssm/getParameter:getParameter': {
                type: 'StringList',
                value: 'abcd,efgh',
            },
        });
        const manifest = stackManifest('{{resolve:ssm:secret}}');
        const converter = new StackConverter(new MockAppComponent('/tmp/foo/bar/does/not/exist'), manifest);

        // WHEN
        converter.convert(new Set());

        // THEN
        const subnet = converter.resources.get({ stackPath: 'stack', id: 'db' })?.resource as native.rds.DbInstance;
        const value = await promiseOf(subnet.masterUserSecret);
        expect(value).toEqual('abcd,efgh');
    });
});
