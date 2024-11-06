import * as aws from '@pulumi/aws';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import * as pulumicdk from '@pulumi/cdk';
import { CfnOutput, SecretValue } from 'aws-cdk-lib';

class SecretsManagerStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);

        const vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 2,
            ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
            natGateways: 0,
            subnetConfiguration: [
                {
                    name: 'Isolated',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
        });
        new rds.DatabaseInstance(this, 'Instance', {
            vpc,
            engine: rds.DatabaseInstanceEngine.mysql({
                version: rds.MysqlEngineVersion.VER_8_0_37,
            }),
            vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }),
            credentials: rds.Credentials.fromGeneratedSecret('admin'),
        });

        const role = new iam.Role(this, 'Role', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });
        const secret = new secrets.Secret(this, 'Secret', {
            description: 'A test secret',
        });
        secret.grantRead(role);

        const rotationLambda = new lambda.Function(this, 'RotationLambda', {
            code: lambda.Code.fromInline('exports.handler = async function(event) { return event; }'),
            handler: 'index.handler',
            runtime: lambda.Runtime.NODEJS_LATEST,
        });
        secret.addRotationSchedule('rotation', {
            rotationLambda,
        });
    }
}

new pulumicdk.App(
    'app',
    (scope: pulumicdk.App) => {
        new SecretsManagerStack(scope, 'teststack');
    },
    {
        appOptions: {
            remapCloudControlResource: (logicalId, typeName, props, options) => {
                if (typeName === 'AWS::SecretsManager::RotationSchedule') {
                    if (props.HostedRotationLambda) {
                        throw new Error('Hosted Rotation is not supported');
                    }
                    return new aws.secretsmanager.SecretRotation(
                        logicalId,
                        {
                            secretId: props.SecretId,
                            rotationRules: {
                                duration: props.RotationRules.Duration,
                                scheduleExpression: props.RotationRules.ScheduleExpression,
                                automaticallyAfterDays: props.RotationRules.AutomaticallyAfterDays,
                            },
                            rotateImmediately: props.RotateImmediatelyOnUpdate,
                            rotationLambdaArn: props.RotationLambdaARN,
                        },
                        options,
                    );
                }
                return undefined;
            },
        },
    },
);
