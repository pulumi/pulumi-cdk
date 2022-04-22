// Copyright 2016-2022, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as autoscaling from "aws-cdk-lib/aws-autoscaling";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from "aws-cdk-lib/aws-s3";
import { Service, Source } from "@aws-cdk/aws-apprunner-alpha"
import { App, Stack, Aspects } from 'aws-cdk-lib';
import { GraphBuilder, GraphNode } from "../src/graph";
import { Construct } from "constructs";
import { expect } from "chai";

function testGraph(fn: (scope: Construct) => void, expected: (string | RegExp)[], done: any) {
    const app = new App();
    const stack = new GraphTester(app, "graphtest", fn);
    app.synth();
    const sortedPaths = stack.nodes.map(n => n.construct.node.path);

    expect(sortedPaths.length).to.equal(expected.length);
    for (let i = 0; i < sortedPaths.length; i++) {
        const [actualPath, expectedPath] = [sortedPaths[i], expected[i]];
        if (typeof expectedPath === "string") {
            expect(actualPath).to.equal(expectedPath);
        } else {
            expect(actualPath).to.match(expectedPath);
        }
    }

    done();
}

class GraphTester extends Stack {
    public nodes: GraphNode[] = [];

    constructor(scope: Construct, id: string, fn: (scope: Construct) => void) {
        super(undefined, id);

        Aspects.of(scope).add({
            visit: (node) => {
                if (node === scope) {
                    this.nodes = GraphBuilder.build(this);
                }
            },
        });

        fn(this);
    }
}

describe('Graph tests', () => {
    it('Test sort for single resource', done => {
        testGraph(stack => {
            new s3.Bucket(stack, 'MyFirstBucket', { versioned: true });
        }, [
            "graphtest",
            "graphtest/MyFirstBucket",
            "graphtest/MyFirstBucket/Resource",
        ], done);
    });

    it('Test sort for ALB example', done => {
        testGraph(stack => {
            const vpc = new ec2.Vpc(stack, 'VPC');

            const asg = new autoscaling.AutoScalingGroup(stack, 'ASG', {
              vpc,
              instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
              machineImage: new ec2.AmazonLinuxImage(),
            });

            const lb = new elbv2.ApplicationLoadBalancer(stack, 'LB', {
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
        }, [
            "graphtest",
            "graphtest/VPC",
            "graphtest/VPC/Resource",
            "graphtest/VPC/PublicSubnet1",
            "graphtest/VPC/PublicSubnet1/Subnet",
            "graphtest/VPC/PublicSubnet1/RouteTable",
            "graphtest/VPC/PublicSubnet1/RouteTableAssociation",
            "graphtest/VPC/IGW",
            "graphtest/VPC/PublicSubnet1/DefaultRoute",
            "graphtest/VPC/PublicSubnet1/EIP",
            "graphtest/VPC/PublicSubnet1/NATGateway",
            "graphtest/VPC/PublicSubnet2",
            "graphtest/VPC/PublicSubnet2/Subnet",
            "graphtest/VPC/PublicSubnet2/RouteTable",
            "graphtest/VPC/PublicSubnet2/RouteTableAssociation",
            "graphtest/VPC/PublicSubnet2/DefaultRoute",
            "graphtest/VPC/PublicSubnet2/EIP",
            "graphtest/VPC/PublicSubnet2/NATGateway",
            "graphtest/VPC/PrivateSubnet1",
            "graphtest/VPC/PrivateSubnet1/Subnet",
            "graphtest/VPC/PrivateSubnet1/RouteTable",
            "graphtest/VPC/PrivateSubnet1/RouteTableAssociation",
            "graphtest/VPC/PrivateSubnet1/DefaultRoute",
            "graphtest/VPC/PrivateSubnet2",
            "graphtest/VPC/PrivateSubnet2/Subnet",
            "graphtest/VPC/PrivateSubnet2/RouteTable",
            "graphtest/VPC/PrivateSubnet2/RouteTableAssociation",
            "graphtest/VPC/PrivateSubnet2/DefaultRoute",
            "graphtest/VPC/VPCGW",
            "graphtest/ASG",
            "graphtest/ASG/InstanceSecurityGroup",
            "graphtest/ASG/InstanceSecurityGroup/Resource",
            "graphtest/LB",
            "graphtest/LB/SecurityGroup",
            "graphtest/LB/SecurityGroup/Resource",
            /graphtest\/ASG\/InstanceSecurityGroup\/from graphtestLBSecurityGroup[A-Z0-9]+:80/,
            "graphtest/ASG/InstanceRole",
            "graphtest/ASG/InstanceRole/Resource",
            "graphtest/ASG/InstanceProfile",
            /graphtest\/SsmParameterValue:.*/,
            "graphtest/ASG/LaunchConfig",
            "graphtest/LB/Listener",
            "graphtest/LB/Listener/TargetGroup",
            "graphtest/LB/Listener/TargetGroup/Resource",
            "graphtest/ASG/ASG",
            "graphtest/ASG/ScalingPolicyAModestLoad",
            "graphtest/LB/Resource",
            "graphtest/LB/Listener/Resource",
            "graphtest/ASG/ScalingPolicyAModestLoad/Resource",
            /graphtest\/LB\/SecurityGroup\/to graphtestASGInstanceSecurityGroup[A-Z0-9]+:80/,
        ], done);
    });

    it('Test sort for appsvc example', done => {
        testGraph(stack => {
            const cluster = new ecs.CfnCluster(stack, "clusterstack");

            const role = new iam.Role(stack, "taskexecrole",
                {
                    assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
                });

            new elbv2.CfnListener(stack, "web", {
                loadBalancerArn: "dummy-alb-arn",
                port: 80,
                protocol: "HTTP",
                defaultActions: [{
                    type: "forward",
                    targetGroupArn: "dummy-target-group-arn",
                }],
            });

            const taskDefinition = new ecs.CfnTaskDefinition(stack, "apptask", {
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
            new ecs.CfnService(stack, "appsvc", {
                serviceName: "app-svc-cloud-api",
                cluster: cluster.attrArn,
                desiredCount: 1,
                launchType: "FARGATE",
                taskDefinition: taskDefinition.attrTaskDefinitionArn,
                networkConfiguration: {
                    awsvpcConfiguration: {
                        assignPublicIp: "ENABLED",
                        subnets: ["dummy-subnet-id-0", "dummy-subnet-id-1"],
                        securityGroups: ["dummy-security-group-id"],
                    },
                },
                loadBalancers: [{
                    targetGroupArn: "dummy-target-group-arn",
                    containerName: "my-app",
                    containerPort: 80,
                }],
            });
        }, [
            "graphtest",
            "graphtest/clusterstack",
            "graphtest/taskexecrole",
            "graphtest/taskexecrole/Resource",
            "graphtest/web",
            "graphtest/apptask",
            "graphtest/appsvc",
        ], done);
    });

    it('Test sort for apprunner example', done => {
        testGraph(stack => {
            const service = new Service(stack, "service", {
                source: Source.fromEcrPublic({
                    imageConfiguration: { port: 8000 },
                    imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
                }),
            });
        }, [
            "graphtest",
            "graphtest/service",
            "graphtest/service/Resource",
        ], done);
    });
});
