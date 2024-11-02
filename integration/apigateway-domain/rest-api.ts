import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as pulumicdk from '@pulumi/cdk';
import * as aws from '@pulumi/aws';
import { Construct } from 'constructs';
import { Size } from 'aws-cdk-lib/core';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class RestApi extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const api = new apigateway.RestApi(this, 'my-api', {
            retainDeployments: true,
            minCompressionSize: Size.bytes(1024),
            description: 'api description',
        });

        const zone = aws.route53.getZoneOutput({
            name: 'pulumi-demos.net',
        });

        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'hosted-zone', {
            zoneName: pulumicdk.asString(zone.name),
            hostedZoneId: pulumicdk.asString(zone.zoneId),
        });

        const certificate = new acm.Certificate(this, 'Cert', {
            domainName: '*.pulumi-demos.net',
            validation: acm.CertificateValidation.fromDns(hostedZone),
        });

        const domain = new apigateway.DomainName(this, 'Domain', {
            domainName: 'api.pulumi-demos.net',
            certificate,
            endpointType: apigateway.EndpointType.REGIONAL,
        });
        new apigateway.BasePathMapping(this, 'orders', {
            domainName: domain,
            basePath: 'orders',
            restApi: api,
        });
        //
        new apigwv2.CfnApiMapping(this, id, {
            apiId: api.restApiId,
            stage: api.deploymentStage.stageName,
            domainName: domain.domainName,
            apiMappingKey: 'orders/v2',
        });
    }
}
