import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';

import { Duration } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';

class FargateStack extends pulumicdk.Stack {
    loadBalancerDNS: pulumi.Output<string>;

    constructor(id: string, options?: pulumicdk.StackOptions) {
        super(id, options);

        // Create VPC and Fargate Cluster
        // NOTE: Limit AZs to avoid reaching resource quotas
        const vpc = new ec2.Vpc(this, 'MyVpc', { maxAzs: 2 });
        const cluster = new ecs.Cluster(this, 'fargate-service-autoscaling', { vpc });

        // Create Fargate Service
        const fargateService = new ecs_patterns.NetworkLoadBalancedFargateService(this, 'sample-app', {
            cluster,
            taskImageOptions: {
                image: ecs.ContainerImage.fromRegistry('amazon/amazon-ecs-sample'),
            },
        });

        // Open port 80 inbound to IPs within VPC to allow network load balancer to connect to the service
        fargateService.service.connections.securityGroups[0].addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(80),
            'allow http inbound from vpc',
        );

        // Setup AutoScaling policy
        const scaling = fargateService.service.autoScaleTaskCount({ maxCapacity: 2 });
        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 50,
            scaleInCooldown: Duration.seconds(60),
            scaleOutCooldown: Duration.seconds(60),
        });

        this.loadBalancerDNS = this.asOutput(fargateService.loadBalancer.loadBalancerDnsName);

        // Finalize the stack and deploy its resources.
        this.synth();
    }
}

const stack = new FargateStack('fargatestack');
export const loadBalancerURL = stack.loadBalancerDNS;
