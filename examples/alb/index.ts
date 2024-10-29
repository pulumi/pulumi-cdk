import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { CfnOutput } from 'aws-cdk-lib';

class AlbStack extends pulumicdk.Stack {
    url: pulumi.Output<string>;

    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

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

        const tg = listener.addTargets('Target', {
            port: 80,
            targets: [asg],
        });

        // workaround for https://github.com/pulumi/pulumi-cdk/issues/62
        const cfnTargetGroup = tg.node.defaultChild as elbv2.CfnTargetGroup;
        cfnTargetGroup.overrideLogicalId('LBListenerTG');

        listener.connections.allowDefaultPortFromAnyIpv4('Open to the world');

        asg.scaleOnRequestCount('AModestLoad', {
            targetRequestsPerMinute: 60,
        });

        this.url = this.asOutput(lb.loadBalancerDnsName);
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new AlbStack(scope, 'teststack');
            return { url: stack.url };
        });
    }
}

const app = new MyApp();

export const url = app.outputs['url'];
