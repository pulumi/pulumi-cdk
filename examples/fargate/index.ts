import * as path from 'path';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';

import { Duration } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';

const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
class FargateStack extends pulumicdk.Stack {
    loadBalancerDNS: pulumi.Output<string>;

    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

        // Create VPC and Fargate Cluster
        // NOTE: Limit AZs to avoid reaching resource quotas
        const vpc = new ec2.Vpc(this, 'MyVpc', { maxAzs: 2 });
        const cluster = new ecs.Cluster(this, 'fargate-service-autoscaling', { vpc });

        // Create Fargate Service
        const fargateService = new ecs_patterns.NetworkLoadBalancedFargateService(this, 'sample-app', {
            cluster,
            taskImageOptions: {
                image: ecs.ContainerImage.fromAsset(path.join(__dirname, 'app'), {
                    exclude: ['node_modules'],
                    // assetName is now required and is used in the name of the ecr repository that is created
                    assetName: 'cdk-fargate-example',
                    platform: Platform.LINUX_AMD64,
                }),
            },
        });

        // Open port 80 inbound to IPs within VPC to allow network load balancer to connect to the service
        fargateService.service.connections.allowFrom(
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
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super(
            'app',
            (scope: pulumicdk.App): pulumicdk.AppOutputs => {
                const stack = new FargateStack(scope, `${prefix}-fargatestack`);
                return { loadBalancerURL: stack.loadBalancerDNS };
            },
            {
                appOptions: {
                    props: {
                        // set the outdir to a relative path in the current directory to avoid
                        // asset diffs
                        outdir: 'cdk.out',
                    },
                },
            },
        );
    }
}

const app = new MyApp();
export const loadBalancerURL = pulumi.interpolate`${app.outputs['loadBalancerURL']}/`;
