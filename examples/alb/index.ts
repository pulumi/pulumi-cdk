import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as pulumi from "@pulumi/pulumi";
import * as cdk from "@pulumi/cdk";
import { Construct } from "constructs";
import { CfnOutput } from "aws-cdk-lib";

const stack = new cdk.CdkStackComponent("teststack", (scope: Construct, parent: cdk.CdkStackComponent) => {
    const adapter = new cdk.AwsPulumiAdapter(scope, "adapter", parent);

    const vpc = new ec2.Vpc(adapter, 'VPC');

    const asg = new autoscaling.AutoScalingGroup(adapter, 'ASG', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage(),
    });

    const lb = new elbv2.ApplicationLoadBalancer(adapter, 'LB', {
      vpc,
      internetFacing: true
    });

    const listener = lb.addListener('Listener', {
      port: 80,
    });

    listener.addTargets('Target', {
      port: 80,
      targets: [asg]
    });

    listener.connections.allowDefaultPortFromAnyIpv4('Open to the world');

    asg.scaleOnRequestCount('AModestLoad', {
      targetRequestsPerMinute: 60,
    });

    new CfnOutput(adapter, "url", { value: lb.loadBalancerDnsName });

    return adapter;
});

export const url = stack.outputs["url"];
