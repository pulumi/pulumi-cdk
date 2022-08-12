import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as pulumiaws from "@pulumi/aws-native";

class ECSClusterStack extends pulumicdk.Stack {
    clusterArn: pulumi.Output<string>;

    constructor(id: string, options?: pulumicdk.StackOptions) {
        super(id, options);

        const vpc = ec2.Vpc.fromLookup(this, 'MyVpc', {
            isDefault: true,
        })
        const cluster = new ecs.Cluster(this, 'fargate-service-autoscaling', { vpc });

        this.clusterArn = this.asOutput(cluster.clusterArn);

        this.synth();
    }
}

export const clusterArn = pulumiaws.getAccountId().then(account => {
    const stack = new ECSClusterStack('teststack', {
        props: {
            env: {
                region: pulumiaws.config.region,
                account: account.accountId,
            }
        }
    });
    return stack.clusterArn;
});
