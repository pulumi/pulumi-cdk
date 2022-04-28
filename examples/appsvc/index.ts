import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elasticloadbalancingv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import { Construct } from 'constructs';
import * as aws from '@pulumi/aws';
import { CfnOutput } from 'aws-cdk-lib';

const defaultVpc = pulumi.output(aws.ec2.getVpc({ default: true }));
const defaultVpcSubnets = defaultVpc.id.apply((id) => aws.ec2.getSubnetIds({ vpcId: id }));

const group = new aws.ec2.SecurityGroup('web-secgrp', {
    vpcId: defaultVpc.id,
    description: 'Enable HTTP access',
    ingress: [
        {
            protocol: 'tcp',
            fromPort: 80,
            toPort: 80,
            cidrBlocks: ['0.0.0.0/0'],
        },
    ],
    egress: [
        {
            protocol: '-1',
            fromPort: 0,
            toPort: 0,
            cidrBlocks: ['0.0.0.0/0'],
        },
    ],
});

const alb = new aws.lb.LoadBalancer('app-lb', {
    securityGroups: [group.id],
    subnets: defaultVpcSubnets.ids,
});

const atg = new aws.lb.TargetGroup('app-tg', {
    port: 80,
    protocol: 'HTTP',
    targetType: 'ip',
    vpcId: defaultVpc.id,
});

// const rpa = new aws.iam.RolePolicyAttachment("task-exec-policy", {
// 	role: role.name,
// 	policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
// });

class ClusterStack extends pulumicdk.Stack {
    constructor(name: string) {
        super(name);

        const cluster = new ecs.CfnCluster(this, 'clusterstack');

        const role = new iam.Role(this, 'taskexecrole', {
            assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        });

        const listener = new elasticloadbalancingv2.CfnListener(this, 'web', {
            loadBalancerArn: pulumicdk.asString(alb.arn),
            port: 80,
            protocol: 'HTTP',
            defaultActions: [
                {
                    type: 'forward',
                    targetGroupArn: pulumicdk.asString(atg.arn),
                },
            ],
        });

        const taskDefinition = new ecs.CfnTaskDefinition(this, 'apptask', {
            family: 'fargate-task-definition',
            cpu: '256',
            memory: '512',
            networkMode: 'awsvpc',
            requiresCompatibilities: ['FARGATE'],
            executionRoleArn: role.roleArn,
            containerDefinitions: [
                {
                    name: 'my-app',
                    image: 'nginx',
                    portMappings: [
                        {
                            containerPort: 80,
                            hostPort: 80,
                            protocol: 'tcp',
                        },
                    ],
                },
            ],
        });

        const service = new ecs.CfnService(this, 'appsvc', {
            serviceName: 'app-svc-cloud-api',
            cluster: cluster.attrArn,
            desiredCount: 1,
            launchType: 'FARGATE',
            taskDefinition: taskDefinition.attrTaskDefinitionArn,
            networkConfiguration: {
                awsvpcConfiguration: {
                    assignPublicIp: 'ENABLED',
                    subnets: pulumicdk.asList(defaultVpcSubnets.ids),
                    securityGroups: [pulumicdk.asString(group.id)],
                },
            },
            loadBalancers: [
                {
                    targetGroupArn: pulumicdk.asString(atg.arn),
                    containerName: 'my-app',
                    containerPort: 80,
                },
            ],
        });
        service.addDependsOn(listener);

        new CfnOutput(this, 'serviceName', { value: service.attrName });

        this.synth();
    }
}

const stack = new ClusterStack('teststack');
export const serviceName = stack.outputs['serviceName'];
