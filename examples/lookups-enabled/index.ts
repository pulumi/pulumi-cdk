import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {
    aws_elasticloadbalancingv2,
    aws_elasticloadbalancingv2_targets,
    aws_route53,
    aws_route53_targets,
    CfnOutput,
} from 'aws-cdk-lib';

const config = new pulumi.Config();
const zoneName = config.require('zoneName');
const prefix = config.get('prefix') ?? pulumi.getStack();

export class Ec2CdkStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string) {
        super(app, id, {
            props: {
                env: app.env,
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
            owners: ['amazon'],
        });

        const instance = new ec2.Instance(this, 'Instance', {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            machineImage,
        });

        const lb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(this, 'lb', {
            vpc,
        });

        const listener = lb.addListener('http', {
            protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
        });

        listener.addTargets('instance', {
            protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
            targets: [new aws_elasticloadbalancingv2_targets.InstanceTarget(instance)],
        });

        const hostedZone = aws_route53.HostedZone.fromLookup(this, 'hosted-zone', {
            domainName: zoneName,
        });

        new aws_route53.AaaaRecord(this, 'record', {
            zone: hostedZone,
            recordName: prefix,
            target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(lb)),
        });

        new CfnOutput(this, 'instanceId', { value: instance.instanceId });
        new CfnOutput(this, 'imageId', { value: machineImage.getImage(this).imageId });
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new Ec2CdkStack(scope, `${prefix}-lookups-enabled`);
});

export const imageId = app.outputs['imageId'];
export const instanceId = app.outputs['instanceId'];
