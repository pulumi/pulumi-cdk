import * as aws from '@pulumi/aws';
import * as pulumicdk from '@pulumi/cdk';
import { RestApi } from './rest-api';
import { ResourceAttributeMappingArray, ResourceMapping } from '../../lib/interop';

class ApiGatewayStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string, options?: pulumicdk.StackOptions) {
        super(app, id, options);
        this.node.setContext('@aws-cdk/aws-apigateway:disableCloudWatchRole', 'true');

        new RestApi(this, 'test-api');
    }
}

new pulumicdk.App(
    'app',
    (scope: pulumicdk.App) => {
        new ApiGatewayStack(scope, 'test-api-domain');
    },
    {
        appOptions: {
            remapCloudControlResource: (logicalId, typeName, props, options): ResourceMapping | undefined => {
                if (typeName === 'AWS::CertificateManager::Certificate') {
                    const resources: ResourceAttributeMappingArray = [];
                    const hostedZoneId: string = props.DomainValidationOptions[0].HostedZoneId;
                    const certLogicalId = `${logicalId}-cert`;
                    const cert = new aws.acm.Certificate(
                        certLogicalId,
                        {
                            domainName: props.DomainName,
                            validationMethod: 'DNS',
                        },
                        options,
                    );
                    resources.push({
                        logicalId: certLogicalId,
                        resource: cert,
                    });

                    const records: aws.route53.Record[] = [];
                    cert.domainValidationOptions.apply((opts) => {
                        opts.map((opt, i) => {
                            const id = `${logicalId}-${i}`;
                            const record = new aws.route53.Record(
                                id,
                                {
                                    allowOverwrite: true,
                                    records: [opt.resourceRecordValue],
                                    name: opt.resourceRecordName,
                                    ttl: 60,
                                    type: opt.resourceRecordType,
                                    zoneId: hostedZoneId,
                                },
                                options,
                            );
                            resources.push({
                                logicalId: id,
                                resource: record,
                            });
                            records.push(record);
                        });
                    });

                    const validation = new aws.acm.CertificateValidation(
                        logicalId,
                        {
                            certificateArn: cert.arn,
                            validationRecordFqdns: records.map((record) => record.fqdn),
                        },
                        options,
                    );
                    resources.push({
                        logicalId,
                        resource: validation,
                        attributes: {
                            ...Object.getOwnPropertyDescriptors(cert),
                            id: validation.certificateArn,
                        },
                    });

                    return resources;
                }
                return undefined;
            },
        },
    },
);
