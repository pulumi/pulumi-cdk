import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as aws from '@pulumi/aws';
import { Construct } from 'constructs';

class LatestAmazonLinux implements ec2.IMachineImage {
    getImage(scope: Construct): ec2.MachineImageConfig {
        const linuxImage = aws.ssm.Parameter.get("latest-image", "/aws/service/ami-amazon-linux-latest/amzn-ami-hvm-x86_64-gp2");
        return {
            imageId: pulumicdk.asString(linuxImage.value),
            osType: ec2.OperatingSystemType.LINUX,
            userData: ec2.UserData.forLinux(),
        };
    }
}

class AlbStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const vpc = new ec2.Vpc(this, 'VPC');

        const asg = new autoscaling.AutoScalingGroup(this, 'ASG', {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
            machineImage: new ec2.AmazonLinuxImage(),
        });

        const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
            vpc,
            internetFacing: true,
        });

        const listener = lb.addListener('Listener', {
            port: 80,
        });

        listener.addTargets('Target', {
            port: 80,
            targets: [asg],
        });

        listener.connections.allowDefaultPortFromAnyIpv4('Open to the world');

        asg.scaleOnRequestCount('AModestLoad', {
            targetRequestsPerMinute: 60,
        });

        this.url = this.asOutput(lb.loadBalancerDnsName);

        this.synth();
    }
}

const stack = new AlbStack('teststack');
export const url = stack.url;
