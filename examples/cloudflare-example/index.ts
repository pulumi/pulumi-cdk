import * as path from 'path';
import * as pulumi from '@pulumi/pulumi';
import * as pulumicdk from '@pulumi/cdk';
import * as cloudflare from '@pulumi/cloudflare';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';

const accountId = pulumi.secret(process.env['CLOUDFLARE_ACCOUNT_ID']!);
class CloudFlareStack extends pulumicdk.Stack {
    public readonly nameservers: pulumi.Output<string[]>;
    constructor(app: pulumicdk.App, id: string) {
        super(app, id);

        const zone = cloudflare.getZoneOutput({
            accountId,
            name: 'pulumi-cloudflare-demo.com',
        });
        this.nameservers = zone.nameServers;

        const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'service', {
            listenerPort: 80,
            taskImageOptions: {
                image: ecs.ContainerImage.fromAsset(path.join(__dirname, './'), {
                    file: 'app/Dockerfile',
                    exclude: ['cdk.out', 'node_modules'],
                    // assetName is now required and is used in the name of the ecr repository that is created
                    assetName: 'cdk-cloudflare-example',
                    platform: Platform.LINUX_AMD64,
                }),
            },
        });

        new cloudflare.Record('alb', {
            name: 'cdk-alb',
            type: 'CNAME',
            zoneId: zone.zoneId,
            content: this.asOutput(service.loadBalancer.loadBalancerDnsName),
            proxied: true,
        });
    }
}

class MyApp extends pulumicdk.App {
    constructor() {
        super('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
            const stack = new CloudFlareStack(scope, 'cloudflare');
            return {
                nameservers: stack.nameservers,
            };
        });
    }
}

const app = new MyApp();
export const dns = 'http://cdk-alb.pulumi-cloudflare-demo.com';
export const nameservers = pulumi.unsecret(app.outputs['nameservers']);
