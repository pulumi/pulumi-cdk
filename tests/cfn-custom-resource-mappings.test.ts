import { Stack } from 'aws-cdk-lib';
import { mapToCustomResource } from '../src/custom-resource-mapping';
import * as aws from '@pulumi/aws-native';
import { MockSynth } from './mocks';
import { typeName } from '../src/naming';

jest.mock('@pulumi/aws-native', () => {
    return {
        cloudformation: {
            CustomResourceEmulator: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
    };
});

afterAll(() => {
    jest.resetAllMocks();
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('Custom Resource Mapping', () => {
    test.each([['Custom::MyCustomResource'], ['AWS::CloudFormation::CustomResource']])('%s',
        (cfnType) => {
            // GIVEN
            const logicalId = 'My-resource';
            const serviceToken = 'arn:aws:lambda:us-west-2:123456789012:function:my-function';
            const cfnProps = {
                ServiceToken: serviceToken,
                MyProperty: 'my-value',
            };
            const bucketName = 'my-bucket';
            const prefix = 'my-prefix';

            const stack = {
                synthesizer: new MockSynth(bucketName, prefix),
                node: {
                    id: 'my-stack',
                }
            } as unknown as Stack;

            // WHEN
            mapToCustomResource(logicalId, cfnType, cfnProps, {}, stack);
            // THEN
            expect(aws.cloudformation.CustomResourceEmulator).toHaveBeenCalledWith(logicalId, {
                stackId: stack.node.id,
                bucketName,
                bucketKeyPrefix: `${prefix}pulumi/custom-resources/${stack.node.id}/${logicalId}`,
                serviceToken,
                resourceType: cfnType,
                customResourceProperties: cfnProps,
            }, {});
        },
    );

    test('with timeout', () => {
        // GIVEN
        const cfnType = 'Custom::MyCustomResource';
        const logicalId = 'My-resource';
        const serviceToken = 'arn:aws:lambda:us-west-2:123456789012:function:my-function';
        const cfnProps = {
            ServiceToken: serviceToken,
            ServiceTimeout: 60,
            MyProperty: 'my-value',
        };
        const bucketName = 'my-bucket';
        const prefix = 'my-prefix';

        const stack = {
            synthesizer: new MockSynth(bucketName, prefix),
            node: {
                id: 'my-stack',
            }
        } as unknown as Stack;

        // WHEN
        mapToCustomResource(logicalId, cfnType, cfnProps, {}, stack);
        // THEN
        expect(aws.cloudformation.CustomResourceEmulator).toHaveBeenCalledWith(logicalId, {
            stackId: stack.node.id,
            bucketName,
            bucketKeyPrefix: `${prefix}pulumi/custom-resources/${stack.node.id}/${logicalId}`,
            serviceToken,
            resourceType: cfnType,
            customResourceProperties: cfnProps,
        }, {
            customTimeouts: {
                create: '60s',
                update: '60s',
                delete: '60s',
            }
        });
    });

    test('Wrong Synthesizer', () => {
        // GIVEN
        const cfnType = 'Custom::MyCustomResource';
        const logicalId = 'My-resource';
        const serviceToken = 'arn:aws:lambda:us-west-2:123456789012:function:my-function';
        const cfnProps = {
            ServiceToken: serviceToken,
            MyProperty: 'my-value',
        };

        const stack = {
            synthesizer: {},
            node: {
                id: 'my-stack',
            }
        } as unknown as Stack;

        // WHEN/THEN
        expect(() => {
            mapToCustomResource(logicalId, cfnType, cfnProps, {}, stack);
        }).toThrow('Synthesizer of stack my-stack does not support custom resources. It must inherit from PulumiSynthesizerBase.');
    });

    test('Not a CustomResource', () => {
        // GIVEN
        const cfnType = 'AWS::S3::Bucket';
        const logicalId = 'My-resource';


        const stack = {
            synthesizer: new MockSynth("bucket", "prefix/"),
            node: {
                id: 'my-stack',
            }
        } as unknown as Stack;

        // WHEN
        const returnValue = mapToCustomResource(logicalId, cfnType, {}, {}, stack);
        // THEN
        expect(returnValue).not.toBeDefined();
    });
});
