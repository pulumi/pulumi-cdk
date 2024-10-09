import * as pulumi from '@pulumi/pulumi';
import { MockCallArgs, MockResourceArgs } from '@pulumi/pulumi/runtime';
// import * as aws from '@pulumi/aws';
import * as pulumicdk from '@pulumi/cdk';
import * as native from '@pulumi/aws-native';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import {
    aws_ec2,
    aws_elasticloadbalancingv2,
    aws_elasticloadbalancingv2_targets,
    aws_kms,
    aws_route53,
    aws_route53_targets,
    CfnOutput,
} from 'aws-cdk-lib';

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

        // const ami = aws.ec2.getAmiOutput({
        //     owners: ['amazon'],
        //     mostRecent: true,
        //     filters: [
        //         {
        //             name: 'name',
        //             values: ['al2023-ami-2023.*.*.*.*-arm64'],
        //         },
        //     ],
        // });

        const machineImage = new ec2.LookupMachineImage({
            name: 'al2023-ami-2023.*.*.*.*-arm64',
        });

        // const machineImage = ec2.MachineImage.genericLinux({
        //     'us-east-2': pulumicdk.asString(ami.imageId),
        // });
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

        // const zone = aws.route53.getZoneOutput(
        //     {
        //         name: 'pulumi-demos.net',
        //     },
        //     { parent: app },
        // );
        //
        // const hostedZone = aws_route53.HostedZone.fromHostedZoneAttributes(this, 'hosted-zone', {
        //     zoneName: pulumicdk.asString(zone.name),
        //     hostedZoneId: pulumicdk.asString(zone.zoneId),
        // });
        //
        // new aws_route53.AaaaRecord(this, 'record', {
        //     zone: hostedZone,
        //     target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(lb)),
        // });

        new native.ssm.Parameter(
            'instance-param',
            {
                value: this.asOutput(instance.instanceId),
                type: 'String',
            },
            { parent: app },
        );
        new native.ssm.Parameter(
            'image-param',
            {
                value: this.asOutput(machineImage.getImage(this).imageId),
                type: 'String',
            },
            { parent: app },
        );

        new CfnOutput(this, 'instanceId', { value: instance.instanceId });
        new CfnOutput(this, 'imageId', { value: machineImage.getImage(this).imageId });
    }

    // get availabilityZones(): string[] {
    //     return ['us-east-2a', 'us-east-2b'];
    // }
}

const app = new pulumicdk.App(
    'app',
    (scope: pulumicdk.App) => {
        new Ec2CdkStack(scope, 'teststack');
    },
    {
        // remapCloudControlResource(logicalId, typeName, props, options) {
        //     switch (typeName) {
        //         case 'AWS::Route53::RecordSet':
        //             return new aws.route53.Record(logicalId, {
        //                 zoneId: props.HostedZoneId,
        //                 aliases: [
        //                     {
        //                         name: props.AliasTarget.DNSName,
        //                         zoneId: props.AliasTarget.HostedZoneId,
        //                         evaluateTargetHealth: props.AliasTarget.EvaluateTargetHealth,
        //                     },
        //                 ],
        //                 name: props.Name,
        //                 type: props.Type,
        //                 records: props.ResourceRecords,
        //             });
        //         default:
        //             return undefined;
        //     }
        // },
    },
);

// export const imageId = app.outputs.apply((output) => output['imageId']);
// export const instanceId = app.outputs.apply((output) => output['instanceId']);
export const imageId = app.outputs['imageId'];
export const instanceId = app.outputs['instanceId'];
