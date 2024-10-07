import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as aws from '@pulumi/aws';

const defaultVpc = pulumi.output(aws.ec2.getVpc({ default: true }));
const defaultVpcSubnets = defaultVpc.id.apply((id) =>
    aws.ec2.getSubnets({ filters: [{ name: 'vpc-id', values: [id] }] }),
);
const azs = aws.getAvailabilityZonesOutput({
    filters: [
        {
            name: 'opt-in-status',
            values: ['opt-in-not-required'],
        },
    ],
}).names;

class ClusterStack extends pulumicdk.Stack {
    serviceName: pulumi.Output<string>;

    constructor(app: pulumicdk.App, name: string) {
        super(app, name);

        const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
            vpcId: pulumicdk.asString(defaultVpc.id),
            availabilityZones: pulumicdk.asList(azs),
            publicSubnetIds: pulumicdk.asList(defaultVpcSubnets.ids),
        });

        const cluster = new ecs.Cluster(this, 'clusterstack', {
            vpc,
        });

        const role = new iam.Role(this, 'taskexecrole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });

        const alb = new elbv2.ApplicationLoadBalancer(this, 'alb', {
            vpc,
        });

        const webListener = alb.addListener('web', {
            protocol: elbv2.ApplicationProtocol.HTTP,
            port: 80,
        });

        const taskDefinition = new ecs.FargateTaskDefinition(this, 'apptask', {
            family: 'fargate-task-definition',
            cpu: 256,
            memoryLimitMiB: 512,
            executionRole: role,
        });

        taskDefinition.addContainer('my-app', {
            image: ecs.ContainerImage.fromRegistry('nginx'),
            portMappings: [
                {
                    containerPort: 80,
                    hostPort: 80,
                    protocol: ecs.Protocol.TCP,
                },
            ],
        });

        const service = new ecs.FargateService(this, 'appsvc', {
            cluster,
            desiredCount: 1,
            taskDefinition,
            assignPublicIp: true,
        });

        webListener.addTargets('web', {
            port: 80,
            targets: [
                service.loadBalancerTarget({
                    containerName: 'my-app',
                }),
            ],
        });

        this.serviceName = this.asOutput(service.serviceName);
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new ClusterStack(scope, 'teststack');
            return { serviceName: stack.serviceName };
        });
    }
}

const app = new MyApp();
export const serviceName = app.outputs['serviceName'];
