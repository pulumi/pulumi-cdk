import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as aws from '@pulumi/aws';

const defaultVpc = pulumi.output(aws.ec2.getVpc({ default: true }));
const defaultVpcSubnets = defaultVpc.id.apply((id) => aws.ec2.getSubnetIds({ vpcId: id }));
const azs = pulumi.output(
    aws
        .getAvailabilityZones({
            filters: [
                {
                    name: 'opt-in-status',
                    values: ['opt-in-not-required'],
                },
            ],
        })
        .then((az) => az.names),
);

class ClusterStack extends pulumicdk.Stack {
    serviceName: pulumi.Output<string>;

    constructor(name: string) {
        super(name);

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

        this.synth();

        this.serviceName = this.asOutput(service.serviceName);
    }
}

const stack = new ClusterStack('teststack');
export const serviceName = stack.serviceName;
