import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { Construct } from 'constructs';
import { CfnOutput, Stack } from 'aws-cdk-lib';

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

        new CfnOutput(this, 'url', { value: lb.loadBalancerDnsName });
    }
}

const stack = new pulumicdk.Stack('teststack', AlbStack);
export const url = stack.outputs['url'];
