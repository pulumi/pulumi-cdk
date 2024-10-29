import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as pulumicdk from '@pulumi/cdk';
import * as native from '@pulumi/aws-native';
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

export class Ec2CdkStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string) {
        super(app, id, {
            props: {
                env: { region: aws.config.region },
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

        // use getAmiOutput to lookup the AMI instead of ec2.LookupMachineImage
        const ami = aws.ec2.getAmiOutput({
            owners: ['amazon'],
            mostRecent: true,
            filters: [
                {
                    name: 'name',
                    values: ['al2023-ami-2023.*.*.*.*-arm64'],
                },
            ],
        });

        const region = aws.config.requireRegion();
        const machineImage = ec2.MachineImage.genericLinux({
            [region]: pulumicdk.asString(ami.imageId),
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

        const tg = listener.addTargets('instance', {
            protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
            targets: [new aws_elasticloadbalancingv2_targets.InstanceTarget(instance)],
        });
        // workaround for https://github.com/pulumi/pulumi-cdk/issues/62
        const cfnTargetGroup = tg.node.defaultChild as aws_elasticloadbalancingv2.CfnTargetGroup;
        cfnTargetGroup.overrideLogicalId('LBListenerTG');

        // use pulumi getZoneOutput and HostedZone.fromHostedZoneAttributes instead of HostedZone.fromLookup
        const zone = aws.route53.getZoneOutput(
            {
                name: zoneName,
                tags: {
                    Purpose: 'Lookups',
                },
            },
            { parent: app },
        );

        const hostedZone = aws_route53.HostedZone.fromHostedZoneAttributes(this, 'hosted-zone', {
            zoneName: pulumicdk.asString(zone.name),
            hostedZoneId: pulumicdk.asString(zone.zoneId),
        });

        new aws_route53.AaaaRecord(this, 'record', {
            zone: hostedZone,
            target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(lb)),
        });

        // use pulumi native resources side-by-side with CDK resources
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
}

const app = new pulumicdk.App(
    'app',
    (scope: pulumicdk.App) => {
        new Ec2CdkStack(scope, 'teststack');
    },
    {
        appOptions: {
            remapCloudControlResource(logicalId, typeName, props, options) {
                switch (typeName) {
                    case 'AWS::Route53::RecordSet':
                        return [
                            new aws.route53.Record(
                                logicalId,
                                {
                                    zoneId: props.HostedZoneId,
                                    aliases: [
                                        {
                                            name: props.AliasTarget.DNSName,
                                            zoneId: props.AliasTarget.HostedZoneId,
                                            evaluateTargetHealth: props.AliasTarget.EvaluateTargetHealth ?? false,
                                        },
                                    ],
                                    name: props.Name,
                                    type: props.Type,
                                    records: props.ResourceRecords,
                                },
                                options,
                            ),
                        ];
                    default:
                        return undefined;
                }
            },
        },
    },
);

export const imageId = app.outputs['imageId'];
export const instanceId = app.outputs['instanceId'];
