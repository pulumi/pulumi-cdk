import * as path from 'path';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as tls from '@pulumi/tls';
import * as cloudflare from '@pulumi/cloudflare';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';

const accountId = pulumi.secret(process.env['CLOUDFLARE_ACCOUNT_ID']!);
class CloudFlareStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

        // Create VPC and Fargate Cluster
        // NOTE: Limit AZs to avoid reaching resource quotas
        const vpc = new ec2.Vpc(this, 'MyVpc', { maxAzs: 2 });
        const cluster = new ecs.Cluster(this, 'fargate-service-autoscaling', { vpc });

        const taskDef = new ecs.TaskDefinition(this, 'taskdef', {
            compatibility: ecs.Compatibility.FARGATE,
            cpu: '256',
            memoryMiB: '512',
        });

        taskDef.addContainer('app', {
            portMappings: [
                {
                    containerPort: 80,
                },
            ],
            image: ecs.ContainerImage.fromAsset(path.join(__dirname, './'), {
                file: 'app/Dockerfile',
                exclude: ['cdk.out', 'node_modules'],
                // assetName is now required and is used in the name of the ecr repository that is created
                assetName: 'cdk-cloudflare-example',
                platform: Platform.LINUX_AMD64,
            }),
        });

        const service = new ecs.FargateService(this, 'service', {
            cluster,
            taskDefinition: taskDef,
        });

        const alb = new elbv2.ApplicationLoadBalancer(this, 'alb', {
            vpc,
            internetFacing: true,
        });

        const zone = cloudflare.getZoneOutput({
            accountId,
            name: 'pulumi-cloudflare-demo.com',
        });

        // create a Certificate in CloudFlare
        const privateKey = new tls.PrivateKey('key', { algorithm: 'RSA' });
        const certRequest = new tls.CertRequest('request', {
            privateKeyPem: privateKey.privateKeyPem,
        });
        const exampleOriginCaCertificate = new cloudflare.OriginCaCertificate('example', {
            csr: certRequest.certRequestPem,
            hostnames: [pulumi.interpolate`*.${zone.name}`],
            requestType: 'origin-rsa',
            requestedValidity: 7,
        });

        // Import the certificate in ACM
        const cert = new aws.acm.Certificate('import', {
            privateKey: privateKey.privateKeyPem,
            certificateBody: exampleOriginCaCertificate.certificate,
        });

        // Create a L2 reference from the cert arn
        const acmCert = acm.Certificate.fromCertificateArn(this, 'cert', pulumicdk.asString(cert.arn));

        const listener = alb.addListener('https', {
            open: true,
            protocol: elbv2.ApplicationProtocol.HTTPS,
            certificates: [acmCert],
        });

        listener.addTargets('service', {
            targets: [service],
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
        });

        new cloudflare.Record('alb', {
            name: 'cdk-alb',
            type: 'CNAME',
            zoneId: zone.zoneId,
            content: this.asOutput(alb.loadBalancerDnsName),
            proxied: true,
        });
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App) => {
            new CloudFlareStack(scope, 'cloudflare');
        });
    }
}

new MyApp();
export const dns = 'https://cdk-alb.pulumi-cloudflare-demo.com';
