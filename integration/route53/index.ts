import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as pulumicdk from '@pulumi/cdk';
import { Duration } from 'aws-cdk-lib/core';
import { aws_elasticloadbalancingv2, aws_kms, aws_route53_targets } from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';

const config = new pulumi.Config();
const prefix = config.require('prefix');
class Route53Stack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        const kmsKey = new aws_kms.Key(this, 'Key', {
            keySpec: aws_kms.KeySpec.ECC_NIST_P256,
            keyUsage: aws_kms.KeyUsage.SIGN_VERIFY,
            pendingWindow: Duration.days(7),
        });
        const zone = new route53.HostedZone(this, 'HostedZone', {
            zoneName: 'pulumi-cdk.com',
        });
        zone.enableDnssec({
            kmsKey,
        });

        new route53.TxtRecord(this, 'TxtRecord', {
            zone,
            values: ['somevalue'],
            recordName: 'cdk-txt',
        });

        new route53.TxtRecord(this, 'TxtRecord2', {
            zone,
            values: ['hello'.repeat(52)],
            recordName: 'cdk-txt-2',
        });

        new route53.CnameRecord(this, 'Cname', {
            zone,
            recordName: 'cdk-cname',
            domainName: 'pulumi.com',
            ttl: Duration.minutes(1),
        });

        new route53.ARecord(this, 'ARecord', {
            zone,
            recordName: 'cdk-a',
            target: route53.RecordTarget.fromIpAddresses('1.2.3.4'),
            geoLocation: route53.GeoLocation.continent(route53.Continent.NORTH_AMERICA),
        });

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
        const privateZone = new route53.PrivateHostedZone(this, 'PrivateHostedZone', {
            zoneName: 'pulumi-cdk-private.com',
            vpc,
        });
        const nlb = new aws_elasticloadbalancingv2.NetworkLoadBalancer(this, 'NLB', {
            vpc,
            vpcSubnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }),
        });
        new route53.AaaaRecord(this, 'AaaaRecord1', {
            recordName: 'nlb',
            zone: privateZone,
            target: route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(nlb)),
            weight: 1,
        });
        new route53.AaaaRecord(this, 'AaaaRecord2', {
            recordName: 'nlb',
            zone: privateZone,
            target: route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(nlb)),
            weight: 2,
        });
    }
}

new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new Route53Stack(scope, `${prefix}-route53`);
});
