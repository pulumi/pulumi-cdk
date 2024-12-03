import * as aws from '@pulumi/aws';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as pulumicdk from '@pulumi/cdk';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import * as pulumi from '@pulumi/pulumi';

const region = aws.config.requireRegion();
const config = new pulumi.Config();
const prefix = config.get('prefix') ?? pulumi.getStack();
export class Ec2CdkStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

        // Create a Key Pair to be used with this EC2 Instance
        // Temporarily disabled since `cdk-ec2-key-pair` is not yet CDK v2 compatible
        // const key = new KeyPair(this, 'KeyPair', {
        //   name: 'cdk-keypair',
        //   description: 'Key Pair created with CDK Deployment',
        // });
        // key.grantReadOnPublicKey

        // Create new VPC with 2 Subnets
        const vpc = new ec2.Vpc(this, 'VPC', {
            natGateways: 0,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'asterisk',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
            ],
        });

        // Allow SSH (TCP Port 22) access from anywhere
        const securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
            vpc,
            description: 'Allow SSH (TCP port 22) in',
            allowAllOutbound: true,
        });
        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH Access');

        const role = new iam.Role(this, 'ec2Role', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        });

        role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

        // Use Latest Amazon Linux Image - CPU Type ARM64
        const ami = new ec2.AmazonLinuxImage({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
            cpuType: ec2.AmazonLinuxCpuType.ARM_64,
        });

        // Create the instance using the Security Group, AMI, and KeyPair defined in the VPC created
        const ec2Instance = new ec2.Instance(this, 'Instance', {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            machineImage: ami,
            securityGroup: securityGroup,
            role: role,
        });

        // Create an asset that will be used as part of User Data to run on first load
        const asset = new Asset(this, 'Asset', { path: path.join(__dirname, 'config.sh') });
        const localPath = ec2Instance.userData.addS3DownloadCommand({
            bucket: asset.bucket,
            bucketKey: asset.s3ObjectKey,
        });

        ec2Instance.userData.addExecuteFileCommand({
            filePath: localPath,
            arguments: '--verbose -y',
        });
        asset.grantRead(ec2Instance.role);

        // Create outputs for connecting
        new cdk.CfnOutput(this, 'IP Address', { value: ec2Instance.instancePublicIp });
        // new cdk.CfnOutput(this, 'Key Name', { value: key.keyPairName })
        new cdk.CfnOutput(this, 'Download Key Command', {
            value: 'aws secretsmanager get-secret-value --secret-id ec2-ssh-key/cdk-keypair/private --query SecretString --output text > cdk-key.pem && chmod 400 cdk-key.pem',
        });
        new cdk.CfnOutput(this, 'ssh command', {
            value: 'ssh -i cdk-key.pem -o IdentitiesOnly=yes ec2-user@' + ec2Instance.instancePublicIp,
        });

        const ssmName = ec2.AmazonLinuxImage.ssmParameterName({
            generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
            cpuType: ec2.AmazonLinuxCpuType.ARM_64,
        });
        new ec2.Instance(this, 'ssm-instance', {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            machineImage: ec2.MachineImage.genericLinux({
                [region]: `{{resolve:ssm:${ssmName}}}`,
            }),
        });
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App) => {
            new Ec2CdkStack(scope, `${prefix}-ec2`);
        });
    }
}

const app = new MyApp();

export const ipAddress = app.outputs['IP Address'];
export const keyCommand = app.outputs['Download Key Command'];
export const sshCommand = app.outputs['sshCommand'];
