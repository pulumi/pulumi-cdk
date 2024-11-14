import * as path from 'path';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';

import { Duration } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import { CfnTargetGroup } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';

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
                image: ecs.ContainerImage.fromAsset(path.join(__dirname, './'), {
                    file: 'app/Dockerfile',
                    exclude: ['cdk.out', 'node_modules'],
                    // assetName is now required and is used in the name of the ecr repository that is created
                    assetName: 'cdk-fargate-example',
                    platform: Platform.LINUX_AMD64,
                }),
            },
        });

        // workaround for https://github.com/pulumi/pulumi-cdk/issues/62
        const cfnTargetGroup = fargateService.targetGroup.node.defaultChild as CfnTargetGroup;
        cfnTargetGroup.overrideLogicalId('LBListenerTG');

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
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super(
            'app',
            (scope: pulumicdk.App): pulumicdk.AppOutputs => {
                const stack = new FargateStack(scope, 'fargatestack');
                return { loadBalancerURL: stack.loadBalancerDNS };
            },
            {
                // TODO[pulumi/aws-native#1318]
                transforms: [
                    (args: pulumi.ResourceTransformArgs): pulumi.ResourceTransformResult => {
                        if (args.type === 'aws-native:ecs:TaskDefinition') {
                            args.opts.replaceOnChanges = ['containerDefinitions'];
                        }
                        return {
                            opts: {
                                ...args.opts,
                            },
                            props: args.props,
                        };
                    },
                ],
            },
        );
    }
}

const app = new MyApp();
export const loadBalancerURL = pulumi.interpolate`${app.outputs['loadBalancerURL']}/`;
