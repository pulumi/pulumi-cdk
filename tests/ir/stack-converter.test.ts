import { convertStackToIr, CloudFormationTemplate } from '@pulumi/cdk-convert-core';

describe('convertStackToIr', () => {
    test('converts resources with options and outputs', () => {
        const template: CloudFormationTemplate = {
            Resources: {
                MyBucket: {
                    Type: 'AWS::S3::Bucket',
                    Properties: {
                        BucketName: 'my-bucket',
                    },
                    DependsOn: 'OtherResource',
                    DeletionPolicy: 'Retain' as any,
                },
                OtherResource: {
                    Type: 'AWS::SQS::Queue',
                    Properties: {},
                },
            },
            Outputs: {
                BucketName: {
                    Value: { Ref: 'MyBucket' },
                },
            },
            Parameters: {
                Env: {
                    Type: 'String',
                    Default: 'dev',
                },
            },
        };

        const ir = convertStackToIr({
            stackId: 'MyStack',
            stackPath: 'My/Stack',
            template,
        });

        expect(ir).toMatchInlineSnapshot(`
            {
              "outputs": [
                {
                  "description": undefined,
                  "name": "BucketName",
                  "value": {
                    "attributeName": "Ref",
                    "kind": "resourceAttribute",
                    "propertyName": "ref",
                    "resource": {
                      "id": "MyBucket",
                      "stackPath": "My/Stack",
                    },
                  },
                },
              ],
              "parameters": [
                {
                  "default": "dev",
                  "name": "Env",
                  "type": "String",
                },
              ],
              "resources": [
                {
                  "logicalId": "MyBucket",
                  "options": {
                    "dependsOn": [
                      {
                        "id": "OtherResource",
                        "stackPath": "My/Stack",
                      },
                    ],
                    "retainOnDelete": true,
                  },
                  "props": {
                    "BucketName": "my-bucket",
                  },
                  "typeToken": "aws-native:s3:Bucket",
                },
                {
                  "logicalId": "OtherResource",
                  "options": undefined,
                  "props": {},
                  "typeToken": "aws-native:sqs:Queue",
                },
              ],
              "stackId": "MyStack",
              "stackPath": "My/Stack",
            }
        `);
    });
});

describe('convertStackToIr - intrinsics', () => {
    test('resolves joins, splits, conditionals, and dynamic references', () => {
        const template: CloudFormationTemplate = {
            Parameters: {
                Env: {
                    Type: 'String',
                    Default: 'dev',
                },
            },
            Conditions: {
                IsProd: {
                    'Fn::Equals': [{ Ref: 'Env' }, 'prod'],
                },
            },
            Resources: {
                MyBucket: {
                    Type: 'AWS::S3::Bucket',
                    Properties: {
                        BucketName: {
                            'Fn::Join': ['-', ['data', { Ref: 'Env' }, { Ref: 'MyBucket' }]],
                        },
                        Tags: [
                            {
                                Key: 'Stage',
                                Value: { 'Fn::If': ['IsProd', 'prod', 'non-prod'] },
                            },
                        ],
                        NotificationConfiguration: {
                            LambdaConfigurations: {
                                'Fn::Split': [',', 'one,two,three'],
                            },
                        },
                        SecretArn: '{{resolve:secretsmanager:mySecret:SecretString:password}}',
                    },
                },
            },
            Outputs: {
                SecureParam: {
                    Value: '{{resolve:ssm-secure:/config/path}}',
                },
            },
        };

        const ir = convertStackToIr({
            stackId: 'MyStack',
            stackPath: 'My/Stack',
            template,
        });

        expect(ir.resources[0].props.BucketName).toEqual({
            kind: 'concat',
            delimiter: '-',
            values: [
                'data',
                {
                    kind: 'parameter',
                    parameterName: 'Env',
                    stackPath: 'My/Stack',
                },
                {
                    kind: 'resourceAttribute',
                    attributeName: 'Ref',
                    propertyName: 'ref',
                    resource: { id: 'MyBucket', stackPath: 'My/Stack' },
                },
            ],
        });

        expect(ir.resources[0].props.Tags[0].Value).toBe('non-prod');
        expect(ir.resources[0].props.NotificationConfiguration.LambdaConfigurations).toEqual(['one', 'two', 'three']);
        expect(ir.resources[0].props.SecretArn).toEqual({
            kind: 'secretsManagerDynamicReference',
            secretId: 'mySecret',
            secretString: 'SecretString',
            jsonKey: 'password',
            versionStage: undefined,
            versionId: undefined,
        });

        expect(ir.outputs?.[0].value).toEqual({
            kind: 'ssmDynamicReference',
            parameterName: '/config/path',
            secure: true,
        });
    });
});
