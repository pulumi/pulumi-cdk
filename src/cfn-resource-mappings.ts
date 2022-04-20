import * as pulumi from '@pulumi/pulumi';
import { ecs, iam, apprunner, lambda, s3 } from '@pulumi/aws-native';
import { CfnResource, firstToLower } from './interop';
import { CfnElement, Token, Reference, Tokenization } from 'aws-cdk-lib';

export function mapToCfnResource(
    element: CfnElement,
    logicalId: string,
    typeName: string,
    rawProps: any,
    props: any,
    options: pulumi.ResourceOptions,
): { [logicalId: string]: pulumi.Resource } {
    switch (typeName) {
        case 'AWS::AppRunner::Service':
            return { [logicalId]: new apprunner.Service(logicalId, props, options) };
        case 'AWS::ECS::Cluster':
            return { [logicalId]: new ecs.Cluster(logicalId, props, options) };
        case 'AWS::ECS::TaskDefinition':
            return { [logicalId]: new ecs.TaskDefinition(logicalId, props, options) };
        case 'AWS::IAM::Role': {
            // We need this because IAM Role's CFN json format has the following field in uppercase.
            const morphed: any = {};
            Object.entries(rawProps).forEach(([k, v]) => {
                if (k == 'AssumeRolePolicyDocument') {
                    morphed[firstToLower(k)] = v;
                } else {
                    morphed[k] = v;
                }
            });
            return { [logicalId]: new iam.Role(logicalId, morphed, options) };
        }
        case 'AWS::Lambda::Function':
            return { [logicalId]: new lambda.Function(logicalId, props, options) };
        case 'AWS::S3::AccessPoint':
            return {
                [logicalId]: new s3.AccessPoint(
                    logicalId,
                    {
                        ...props,
                        policy: rawProps.Policy,
                    },
                    options,
                ),
            };
        default: {
            // Scrape the attributes off of the construct.
            //
            // NOTE: this relies on CfnReference setting the reference's display name to the literal attribute name.
            const attributes = Object.values(element)
                .filter(Token.isUnresolved)
                .map((v) => Tokenization.reverse(v))
                .filter(Reference.isReference)
                .filter((ref) => ref.target === element)
                .map((ref) => attributePropertyName(ref.displayName));

            return { [logicalId]: new CfnResource(logicalId, typeName, props, attributes, options) };
        }
    }
}

export function attributePropertyName(attributeName: string): string {
    return firstToLower(attributeName.split('.')[0]);
}
