import * as aws from '@pulumi/aws';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as pulumicdk from '@pulumi/cdk';
import { SecretValue, Size } from 'aws-cdk-lib/core';
import * as pulumi from '@pulumi/pulumi';

const config = new pulumi.Config();
const prefix = config.require('prefix');
class Ec2Stack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, {
            ...options,
            props: {
                ...options?.props,
                // required to avoid the Fn::FindInMap
                env: { region: aws.config.region },
            },
        });
        const vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 2,
            ipProtocol: ec2.IpProtocol.DUAL_STACK,
            vpnGateway: true,
            ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
            natGateways: 1,
            vpnConnections: {
                [`dynamic${prefix}`]: {
                    ip: '1.2.3.4',
                    tunnelOptions: [
                        {
                            preSharedKeySecret: SecretValue.unsafePlainText('secretkey1234'),
                        },
                        {
                            preSharedKeySecret: SecretValue.unsafePlainText('secretkey5678'),
                        },
                    ],
                },
                [`static${prefix}`]: {
                    ip: '4.5.6.7',
                    staticRoutes: ['192.168.10.0/24', '192.168.20.0/24'],
                },
            },
            subnetConfiguration: [
                {
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    name: 'Private',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                {
                    name: 'Isolated',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
            restrictDefaultSecurityGroup: false,
        });

        vpc.addFlowLog('FlowLogs', {
            destination: ec2.FlowLogDestination.toCloudWatchLogs(),
        });

        vpc.addGatewayEndpoint('Dynamo', {
            service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
        });
        vpc.addInterfaceEndpoint('ecr', {
            service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        });

        new ec2.PrefixList(this, 'PrefixList', {});
        const nacl = new ec2.NetworkAcl(this, 'NetworkAcl', {
            vpc,
            subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
        });
        nacl.addEntry('AllowAll', {
            cidr: ec2.AclCidr.anyIpv4(),
            ruleAction: ec2.Action.ALLOW,
            ruleNumber: 100,
            traffic: ec2.AclTraffic.allTraffic(),
        });
        new ec2.KeyPair(this, 'KeyPair');

        const nlb = new elbv2.NetworkLoadBalancer(this, 'NLB1', { vpc });
        new ec2.VpcEndpointService(this, 'EndpointService', {
            vpcEndpointServiceLoadBalancers: [nlb],
            allowedPrincipals: [new iam.ArnPrincipal('ec2.amazonaws.com')],
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

        const pg = new ec2.PlacementGroup(this, 'PlacementGroup', {});
        const availabilityZone = pulumicdk.asString(
            aws
                .getAvailabilityZonesOutput({
                    state: 'available',
                    allAvailabilityZones: false,
                    filters: [
                        {
                            name: 'opt-in-status',
                            values: ['opt-in-not-required'],
                        },
                    ],
                })
                .apply((zones) => zones.names[0]),
        );
        const volume = new ec2.Volume(this, 'Volume', {
            availabilityZone,
            size: Size.gibibytes(10),
        });
        const instance = new ec2.Instance(this, 'Instance', {
            vpc,
            // smallest allowed for placement groups
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.M7G, ec2.InstanceSize.MEDIUM),
            machineImage,
            vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }),
            requireImdsv2: true,
            placementGroup: pg,
            blockDevices: [
                {
                    volume: ec2.BlockDeviceVolume.ebs(10, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
                    deviceName: '/dev/sdf',
                },
            ],
        });

        volume.grantAttachVolumeByResourceTag(instance.grantPrincipal, [instance]);

        const instanceProfile = new iam.InstanceProfile(this, 'InstanceProfile');
        new ec2.LaunchTemplate(this, 'LaunchTemplate', {
            blockDevices: [
                {
                    deviceName: '/dev/sdf',
                    volume: ec2.BlockDeviceVolume.ebs(10, { volumeType: ec2.EbsDeviceVolumeType.GP3 }),
                },
            ],
            requireImdsv2: true,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            machineImage,
            httpTokens: ec2.LaunchTemplateHttpTokens.REQUIRED,
            httpPutResponseHopLimit: 1,
            httpEndpoint: true,
            instanceProfile,
        });
    }
}

new pulumicdk.App(
    'app',
    (scope: pulumicdk.App) => {
        new Ec2Stack(scope, `${prefix}-ec2`);
    },
    {
        appOptions: {
            remapCloudControlResource: (logicalId, typeName, props, options) => {
                if (typeName === 'AWS::EC2::VPNGatewayRoutePropagation') {
                    const tableIds: string[] = props.RouteTableIds;
                    return tableIds.flatMap((tableId, i) => {
                        const id = i === 0 ? logicalId : `${logicalId}-${i}`;
                        return {
                            logicalId: id,
                            resource: new aws.ec2.VpnGatewayRoutePropagation(
                                id,
                                {
                                    routeTableId: tableId,
                                    vpnGatewayId: props.VpnGatewayId,
                                },
                                options,
                            ),
                        };
                    });
                }
                if (typeName === 'AWS::EC2::NetworkAclEntry') {
                    return new aws.ec2.NetworkAclRule(logicalId, {
                        egress: props.Egress,
                        toPort: props.PortRange?.To,
                        fromPort: props.PortRange?.From,
                        protocol: props.Protocol,
                        ruleNumber: props.RuleNumber,
                        networkAclId: props.NetworkAclId,
                        ruleAction: props.RuleAction,
                        cidrBlock: props.CidrBlock,
                        ipv6CidrBlock: props.Ipv6CidrBlock,
                        icmpCode: props.Icmp?.Code,
                        icmpType: props.Icmp?.Type,
                    });
                }
                return undefined;
            },
        },
    },
);
