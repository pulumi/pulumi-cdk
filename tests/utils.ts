import { StackManifest } from '../src/assembly';

export function createStackManifest(
    resource2Props: any,
    resource1Props?: any,
    resource2DependsOn?: string | string[],
    resource1DependsOn?: string | string[],
): StackManifest {
    return new StackManifest(
        'dir',
        'stack',
        'template',
        {
            'stack/resource-1': 'resource1',
            'stack/resource-2': 'resource2',
        },
        {
            path: 'stack',
            id: 'stack',
            children: {
                'resource-1': {
                    id: 'resource-1',
                    path: 'stack/resource-1',
                    attributes: {
                        'aws:cdk:cloudformation:type': 'AWS::S3::Bucket',
                    },
                },
                'resource-2': {
                    id: 'resource-2',
                    path: 'stack/resource-2',
                    attributes: {
                        'aws:cdk:cloudformation:type': 'AWS::S3::BucketPolicy',
                    },
                },
            },
        },
        {
            Resources: {
                resource1: {
                    Type: 'AWS::S3::Bucket',
                    Properties: resource1Props ?? {},
                    DependsOn: resource1DependsOn,
                },
                resource2: {
                    Type: 'AWS::S3::BucketPolicy',
                    Properties: resource2Props,
                    DependsOn: resource2DependsOn,
                },
            },
        },
        [],
    );
}
