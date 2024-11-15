import { StackManifest } from '../src/assembly';
import { CloudFormationMapping } from '../src/cfn';

export interface CreateStackManifestProps {
    resource1Props?: any;
    resource2Props: any;
    resource1DependsOn?: string | string[];
    resource2DependsOn?: string | string[];
    mappings?: CloudFormationMapping;
}

export function createStackManifest(props: CreateStackManifestProps): StackManifest {
    return new StackManifest({
        id: 'stack',
        templatePath: 'template',
        metadata: {
            'stack/resource-1': 'resource1',
            'stack/resource-2': 'resource2',
        },
        tree: {
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
        template: {
            Mappings: props.mappings,
            Resources: {
                resource1: {
                    Type: 'AWS::S3::Bucket',
                    Properties: props.resource1Props ?? {},
                    DependsOn: props.resource1DependsOn,
                },
                resource2: {
                    Type: 'AWS::S3::BucketPolicy',
                    Properties: {
                        policyDocument: {},
                        ...props.resource2Props,
                    },
                    DependsOn: props.resource2DependsOn,
                },
            },
        },
        dependencies: [],
    });
}
