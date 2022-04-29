import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as pulumicdk from '@pulumi/cdk';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import { Construct } from 'constructs';
import { Stack } from 'aws-cdk-lib';

class FargateStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        // Create VPC and Fargate Cluster
        // NOTE: Limit AZs to avoid reaching resource quotas
        const vpc = new ec2.Vpc(this, 'MyVpc', { maxAzs: 2 });
        const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

        // Instantiate Fargate Service with just cluster and image
        new ecs_patterns.ApplicationLoadBalancedFargateService(this, "FargateService", {
            cluster,
            taskImageOptions: {
                image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
            },
        });
    }
};

const stack = new pulumicdk.Stack('teststack', FargateStack);
