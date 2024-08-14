import { CfnResource, Stack } from 'aws-cdk-lib/core';
import { mapToAwsResource } from '../src/aws-resource-mappings';
import { setMocks } from './mocks';
import * as aws from '@pulumi/aws';

jest.mock('@pulumi/aws', () => {
    return {
        autoscaling: {
            Group: jest.fn().mockImplementation(() => {
                return {};
            }),
        },
    };
});

afterEach(() => {
    jest.resetAllMocks();
});

beforeAll(() => {
    setMocks();
});

describe('AWS Resource Mappings', () => {
    test('todo test', () => {});
});
