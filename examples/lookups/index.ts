import * as aws from '@pulumi/aws-native';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as pulumicdk from '@pulumi/cdk';
import { CfnOutput } from 'aws-cdk-lib';

export class Ec2CdkStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string) {
        super(app, id, {
            props: {
                env: { region: process.env.AWS_REGION, account: process.env.AWS_ACCOUNT },
            },
        });

        // Create new VPC with 2 Subnets
        const vpc = new ec2.Vpc(this, 'VPC', {
            natGateways: 0,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'asterisk',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
            ],
        });
        const machineImage = new ec2.LookupMachineImage({
            name: 'al2023-ami-2023.*.*.*.*-arm64',
        });

        const instance = new ec2.Instance(this, 'Instance', {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            machineImage,
        });

        const param = new aws.ssm.Parameter('param', {
            value: this.asOutput(instance.instanceId),
            type: 'String',
        });

        new CfnOutput(this, 'instanceId', { value: instance.instanceId });
        new CfnOutput(this, 'imageId', { value: machineImage.getImage(this).imageId });
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new Ec2CdkStack(scope, 'teststack');
});

export const imageId = app.outputs.then((output) => output['imageId']);
export const instanceId = app.outputs.then((output) => output['instanceId']);
