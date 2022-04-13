import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elasticloadbalancingv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as pulumi from "@pulumi/pulumi";
import { CdkStackComponent, AwsPulumiAdapter } from "@pulumi/cdk/interop-aspect";
import { Construct } from "constructs";
import * as aws from "@pulumi/aws";

const defaultVpc = pulumi.output(aws.ec2.getVpc({ default: true }));
const defaultVpcSubnets = defaultVpc.id.apply(id => aws.ec2.getSubnetIds({ vpcId: id }));

const group = new aws.ec2.SecurityGroup("web-secgrp", {
    vpcId: defaultVpc.id,
    description: "Enable HTTP access",
    ingress: [{
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"],
    }],
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
    }],
});

const alb = new aws.lb.LoadBalancer("app-lb", {
    securityGroups: [group.id],
    subnets: defaultVpcSubnets.ids,
});

const atg = new aws.lb.TargetGroup("app-tg", {
    port: 80,
    protocol: "HTTP",
    targetType: "ip",
    vpcId: defaultVpc.id,
});

// const rpa = new aws.iam.RolePolicyAttachment("task-exec-policy", {
// 	role: role.name,
// 	policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
// });

export const albArn = alb.arn;
export const albDnsName = alb.dnsName;
export const atgArn = atg.arn;
export const subnetIds = defaultVpcSubnets.ids;
export const securityGroupId = group.id;

pulumi.all([albArn, atgArn, subnetIds, securityGroupId]).apply(([albArn, atgArn, subnetIds, securityGroupId]) => {
    new CdkStackComponent("teststack", (scope: Construct, parent: CdkStackComponent) => {
        const adapter = new AwsPulumiAdapter(scope, "adapter", parent);

        const cluster = new ecs.CfnCluster(adapter, "clusterstack");

        const role = new iam.Role(adapter, "taskexecrole",
            {
                assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            });

        new elasticloadbalancingv2.CfnListener(adapter, "web", {
            loadBalancerArn: albArn,
            port: 80,
            protocol: "HTTP",
            defaultActions: [{
                type: "forward",
                targetGroupArn: atgArn,
            }],
        });

        const taskDefinition = new ecs.CfnTaskDefinition(adapter, "apptask", {
            family: "fargate-task-definition",
            cpu: "256",
            memory: "512",
            networkMode: "awsvpc",
            requiresCompatibilities: ["FARGATE"],
            executionRoleArn: role.roleArn,
            containerDefinitions: [{
                name: "my-app",
                image: "nginx",
                portMappings: [{
                    containerPort: 80,
                    hostPort: 80,
                    protocol: "tcp"
                }],
            }],
        });
        new ecs.CfnService(adapter, "appsvc", {
            serviceName: "app-svc-cloud-api",
            cluster: cluster.attrArn,
            desiredCount: 1,
            launchType: "FARGATE",
            taskDefinition: taskDefinition.attrTaskDefinitionArn,
            networkConfiguration: {
                awsvpcConfiguration: {
                    assignPublicIp: "ENABLED",
                    subnets: subnetIds,
                    securityGroups: [securityGroupId],
                },
            },
            loadBalancers: [{
                targetGroupArn: atgArn,
                containerName: "my-app",
                containerPort: 80,
            }],
        });
        return adapter;
    });
});
