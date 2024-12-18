import * as pulumicdk from '@pulumi/cdk';
import * as pulumi from '@pulumi/pulumi';
import * as awscc from '@pulumi/aws-native';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import { KubectlV31Layer } from '@aws-cdk/lambda-layer-kubectl-v31';
import { ResourceMapping } from '@pulumi/cdk/lib/interop';
import { Duration } from 'aws-cdk-lib';

class EksStack extends pulumicdk.Stack {
    public readonly clusterName: pulumi.Output<string>;
    public readonly albAddress: pulumi.Output<string>;
    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

        const vpc = new ec2.Vpc(this, 'CdkEksVpc', {});

        // Create the EKS cluster in the VPC and install the ALB controller
        const cluster = new eks.Cluster(this, 'CdkEksCluster', {
            version: eks.KubernetesVersion.V1_31,
            authenticationMode: eks.AuthenticationMode.API,
            endpointAccess: eks.EndpointAccess.PUBLIC,
            kubectlLayer: new KubectlV31Layer(this, 'kubectl'),
            vpc,
            vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
            albController: {
                version: eks.AlbControllerVersion.V2_8_2,
            },
        });

        this.clusterName = this.asOutput(cluster.clusterName);

        const podInfo = cluster.addHelmChart('pod-info', {
            chart: 'podinfo',
            repository: 'https://stefanprodan.github.io/podinfo',
            namespace: 'default',
            version: '6.7.1',
            values: {
                fullnameOverride: 'podinfo',
                replicaCount: 2,
                resources: {
                    requests: {
                        cpu: '100m',
                        memory: '500Mi',
                    },
                    limits: {
                        cpu: '500m',
                        memory: '500Mi',
                    },
                },
                ingress: {
                    enabled: true,
                    className: 'alb',
                    annotations: {
                        'alb.ingress.kubernetes.io/scheme': 'internet-facing',
                        'alb.ingress.kubernetes.io/target-type': 'ip',
                    },
                    hosts: [
                        {
                            host: `*.${this.region}.elb.amazonaws.com`,
                            paths: [
                                {
                                    path: '/',
                                    pathType: 'Prefix',
                                },
                            ],
                        },
                    ],
                },
            },
        });

        // add the alb controller dependency to the pod info helm chart in order for the cleanup to work
        // otherwise the alb controller will be deleted before the pod info helm chart is deleted and leave
        // dangling Load Balancers
        if (cluster.albController) {
            podInfo.node.addDependency(cluster.albController);
        }

        const albAddress = new eks.KubernetesObjectValue(this, 'elbAddress', {
            cluster,
            objectType: 'Ingress',
            objectName: 'podinfo',
            jsonPath: '.status.loadBalancer.ingress[0].hostname',
            timeout: Duration.minutes(15),
        });

        // fetch the alb address after the helm chart is deployed
        albAddress.node.addDependency(podInfo);
        this.albAddress = this.asOutput(albAddress.value);
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super(
            'app',
            (scope: pulumicdk.App): pulumicdk.AppOutputs => {
                const stack = new EksStack(scope, 'eks');
                return {
                    albAddress: stack.albAddress,
                    clusterName: stack.clusterName,
                };
            },
            {
                appOptions: {
                    // TODO[pulumi/pulumi-cdk#293]: 'AWS::IAM::Policy' is currently wrongly mapped to the classic aws.iam.Policy resource.
                    // The AWS::IAM::Policy resource creates an inline policy on the role whereas the Policy resources creates an actual
                    // policy and attaches it to the role. The standalone policy resource is plagued by eventual consistency issues.
                    remapCloudControlResource: (logicalId, typeName, props, options): ResourceMapping | undefined => {
                        if (typeName === 'AWS::IAM::Policy') {
                            return new awscc.iam.RolePolicy(
                                logicalId,
                                {
                                    policyName: props.PolicyName,
                                    policyDocument: props.PolicyDocument,
                                    roleName: props.Roles[0],
                                },
                                options,
                            );
                        }
                        return undefined;
                    },
                },
            },
        );
    }
}

const app = new MyApp();
export const albAddress = app.outputs['albAddress'];
export const clusterName = app.outputs['clusterName'];
