# CDK CLI Library

> NOTE: we have now migrated to the new `toolkit-lib` library, but it is essentially the same as the old `cli-lib-alpha` library

Updating to use the
[cdk-cli-lib](https://docs.aws.amazon.com/cdk/api/v2/docs/cli-lib-alpha-readme.html#cloud-assembly-directory-producer)
in order to support CDK Context requires us to make some user-facing API
changes.

## Context

AWS CDK is split between the “framework” and the “cli”. In order to have all of
the features of CDK you need to support both. An example of this is how
[context](https://docs.aws.amazon.com/cdk/v2/guide/context.html) and lookups
work in CDK. When `cdk synth` is called via the CLI and there are lookups to be
performed it will roughly follow the following steps:

1. CLI executes the framework synth (i.e. `node bin/app.js`)
2. Lookup method called in the “framework” (e.g. `Vpc.fromLookup()`)
3. The “framework” looks up the value in the `cdk.context.json` file.
   1. If the value does not exist then it registers the context as “missing” in
      the Cloud Assembly.
   2. If it does exist then it uses that value and is done
4. Once the framework is done with `synth`, the CLI reads the Cloud Assembly
   and looks for missing context.  
   1. If there are no missing context then the CLI is done and it exits.
   2. If there is missing context then it continues.
5. For each missing context it executes the corresponding context lookup
   function in the CLI to perform AWS SDK calls and gather the data  
6. The data is stored in `cdk.context.json`
7. The CLI executes framework synth again

![][./assets/cdk_synth.png]


### Currently supported CDK Context Providers

CDK does not support very many resource lookups. This is the current list and
I’ve included whether it should be possible to use a Pulumi lookup instead.

- AMIs (Yes)
- Availability Zones (Kind of. It’s not possible for the defining VPC AZs)
- Route53 Hosted Zones (Yes)
- KMS Keys (Yes)
- SSM Parameters
- Security Groups (Yes, mostly)
- Endpoint Service Availability Zones (Yes)
- VPCs (No)
- Load Balancers (No, requires VPC)


## Constraints

1. We can use the
   [cdk-cli-lib](https://docs.aws.amazon.com/cdk/api/v2/docs/cli-lib-alpha-readme.html#cloud-assembly-directory-producer)
   to handle gathering context and handle the multiple passes of executing the
   framework, but we have to create the `cdk.App` within an async method.

```javascript
class MyProducer implements ICloudAssemblyDirectoryProducer {
  async produce(context: Record<string, any>) {
    const app = new cdk.App({ context });
    const stack = new cdk.Stack(app);
    return app.synth().directory;
  }
}

const cli = AwsCdkCli.fromCloudAssemblyDirectoryProducer(new MyProducer());
await cli.synth();
```

This library requires us to create the `cdk.App` within the `produce` method of
`ICloudAssemblyDirectoryProducer`. This is because the `App` and all constructs
within it must be constructed with the full `context` value. It is not possible
to add context after a construct has been constructed.

2. Because the constructs can be called multiple times, any Pulumi resources
   which are created inside a construct class will also be constructed multiple
   times. This means we need a way of knowing when the final call happens and
   it is safe to construct the Pulumi resources.
   1. One thing to note: CDK lookups are infrequently performed. Typically they
      are performed once when they are added and then they are cached in the
      `cdk.context.json` file. This means that the multiple pass execution will
      happen infrequently.


## Decision

### App with callback argument

We will introduce a new `App` class which accepts a callback function as the
second argument. The user would have to create resources within this call back
function. The API that looks something like this for the end user. 

This would allow us to create the `App` inside a Pulumi `ComponentResource` and
then pass the created `App` to the `(scope: pulumicdk.App) => {}` function.

```javascript
const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new Ec2CdkStack(scope, 'teststack');
});

// with app outputs
const app = new pulumicdk.App('app', (scope: pulumicdk.App): pulumicdk.AppOutputs => {
    const stack = new Ec2CdkStack(scope, 'teststack');
    return {
        instanceId: stack.instanceId,
    };
});
export const instanceId = app.outputs['instanceId'];
```

### User retry

In order to handle #2 above where resources will be called multiple times, we
will require the user to run the Pulumi command two times. Context
lookups are different from Pulumi data calls since they are meant to be called
one time when they are initially added and then from then on the data is cached
in `cdk.context.json` and the lookup doesn’t need to be performed again. The
user experience would look something like this:

1. User adds a lookup `Vpc.fromLookup()`
2. `pulumi up`
3. Lookups are performed, stored in `cdk.context.json` and an error is thrown.
4. `pulumi up` succeeds from then on.

While this option is not ideal, it will offer the best compromise which still
allows users to perform all CDK lookups. We will call it out in documentation
and recommend users to use Pulumi native lookups for most things and only fall
back to CDK lookups for `VPC` and `Load Balancers`.

## Alternatives

### Mock resource calls

In order to handle #2 above where resources will be called multiple times, we
could handle it by somehow mocking the resource calls until we are done. I’m
not sure if this is even possible and would probably require some new features
in core. At a very high level it could look something like this.

```javascript
export class App extends pulumi.ComponentResource {
    async initialize() {
        const cli = AwsCdkCli.fromCloudAssemblyDirectoryProducer(this);
        // set mocks before we synth
        pulumi.runtime.setMocks();
        // multiple passes will occur within this. Once we are done
        // it will proceed past this.
        await cli.synth();
        // restore
        pulumi.runtime.resetMocks();
        // create resources 1 last time with all context available.
        await cli.synth();
    }
}
```

### Disable context lookups (but still support static context)

In this case we would simply disable context lookups. If the application needed
to perform lookups it would throw an error like the example below. 

We could offer partial support for simple lookups. The user could get the value
and populate `cdk.context.json` manually. Alternatively, for simple lookups
they could switch to using Pulumi data resources. The downside to this, since
it wouldn’t be possible to support all lookups, is that it would add a lot of
extra friction having to know what is/is not supported and how to do it the
Pulumi way.

```
Diagnostics:
  pulumi:pulumi:Stack (pulumi-lookups-dev):
    error: Context lookups have been disabled. Make sure all necessary context is already in "cdk.context.json".
    Missing context keys: 'availability-zones:account=12345678910:region=us-east-2, ami:account=12345678910:filters.image-type.0=machine:filters.name.0=al2023-ami-2023.*.*.*.*-arm64:filters.state.0=available:region=us-east-2'
```

**Examples**

**VPC Lookup**

In order to import a VPC you need all of this information. The logic for VPC
lookup is pretty complicated and I’m not sure it would be a good idea to try
and replicate it in Pulumi.

```javascript
aws_ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
    region: '',
    vpcId: '',
    availabilityZones: [],
    vpcCidrBlock: '',
    vpnGatewayId: '',
    publicSubnetIds: [],
    privateSubnetIds: [],
    isolatedSubnetIds: [],
    publicSubnetNames: [],
    privateSubnetNames: [],
    isolatedSubnetNames: [],
    publicSubnetRouteTableIds: [],
    privateSubnetRouteTableIds: [],
    publicSubnetIpv4CidrBlocks: [],
    isolatedSubnetRouteTableIds: [],
    privateSubnetIpv4CidrBlocks: [],
    isolatedSubnetIpv4CidrBlocks: [],
});
```

**SecurityGroup With CDK Lookups**

```javascript
aws_ec2.SecurityGroup.fromLookupByName(this, 'sg', 'sg-name', vpc);
```

**SecurityGroup Without CDK Lookups**

```javascript
const sg = aws.ec2.getSecurityGroupOutput({
    vpcId: this.asOutput(vpc.vpcId),
    name: 'sg-name',
});

aws_ec2.SecurityGroup.fromSecurityGroupId(this, 'sg', pulumicdk.asString(sg.id), {
    // CDK fromLookup will figure this out for you
    allowAllOutbound: false,
});
```

**KMS Key With CDK Lookups**

```javascript
const key = aws_kms.Key.fromLookup(this, 'key', {
    aliasName: 'alias',
});
```

**KMS Key Without CDK Lookups**

```javascript
const alias = aws.kms.getAliasOutput({
    name: 'alias/somealias',
});

const key = aws_kms.Key.fromKeyArn(this, 'key', pulumicdk.asString(alias.targetKeyArn))
```

**Route53 With CDK Lookups**

```javascript
const hostedZone = aws_route53.HostedZone.fromLookup(this, 'hosted-zone', {
    domainName: 'pulumi-demos.net',
});

new aws_route53.AaaaRecord(this, 'record', {
    zone: hostedZone,
    target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(lb)),
});

```

**Route53 Without CDK Lookups**

```javascript

const zone = aws.route53.getZoneOutput({
    name: 'pulumi-demos.net',
});
const hostedZone = aws_route53.HostedZone.fromHostedZoneAttributes(this, 'hosted-zone', {
    zoneName: pulumicdk.asString(zone.name),
    hostedZoneId: pulumicdk.asString(zone.zoneId),
});

new aws_route53.AaaaRecord(this, 'record', {
    zone: hostedZone,
    target: aws_route53.RecordTarget.fromAlias(new aws_route53_targets.LoadBalancerTarget(lb)),
});
```

**AMI / AZs With CDK lookups**

```javascript
export class Ec2CdkStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string) {
        super(app, id, {
            props: {
                // env must be specified to enable lookups
                env: { region: process.env.AWS_REGION, account: process.env.AWS_ACCOUNT },
            },
        });

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
	 // This performs the CDK lookup
        const machineImage = new ec2.LookupMachineImage({
            name: 'al2023-ami-2023.*.*.*.*-arm64',
        });

        const instance = new ec2.Instance(this, 'Instance', {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            machineImage,
        });
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new Ec2CdkStack(scope, 'teststack');
});
```

**AMI / AZs Without CDK lookups**

```javascript
export class Ec2CdkStack extends pulumicdk.Stack {
    constructor(app: pulumicdk.App, id: string) {
        super(app, id, {
            props: {
                env: { region: process.env.AWS_REGION, account: process.env.AWS_ACCOUNT },
            },
        });

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
	 // Use a pulumi lookup to get the AMI
        const ami = aws.ec2.getAmiOutput({
            owners: ['amazon'],
            mostRecent: true,
            filters: [
                {
                    name: 'name',
                    values: ['al2023-ami-2023.*.*.*.*-arm64'],
                },
            ],
        });

        const machineImage = ec2.MachineImage.genericLinux({
            'us-east-2': pulumicdk.asString(ami.imageId),
        });

        const instance = new ec2.Instance(this, 'Instance', {
            vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            machineImage,
        });
    }

    // Since the stack cannot lookup the availability zone you have to provide this method
    get availabilityZones(): string[] {
        return ['us-east-2a', 'us-east-2b'];
    }
}

const app = new pulumicdk.App('app', (scope: pulumicdk.App) => {
    new Ec2CdkStack(scope, 'teststack');
});


```

### Do not support Context

The other alternative would be to not change the API which would mean that we
do not support CDK Context. The user would have to supply any context directly
to the `pulumi-cdk.Stack`

```javascript
new pulumicdk.Stack('Stack', {
    context: {
        // optionally provide lookup context data directly in the correct format
        "availability-zones:account=12345678910:region=us-east-2": [
             "us-east-2a",
             "us-east-2b",
             "us-east-2c"
        ],
        // CDK feature flags
        "@aws-cdk/aws-s3:createDefaultLoggingPolicy": "true",
       // Arbitrary user context
       "my-context-key": "my-context-value",
    }
});
```

## Consequences

Supporting CDK Context would have the following impact on users.

1. Support for sourcing context values natively (from `cdk.json`,
   `cdk.context.json`, environment variables, etc)  
   1. There is a workaround where users could directly supply the context to
      the `Stack` itself. This would only be viable for static context like
      feature flags (example in
      [appendix](https://docs.google.com/document/d/1TFO0RJ4CtynBW8p4vKapy8v4L2AjUxldmrjxS60Tx4o/edit#heading=h.b1s6g8uq0ou7)
      )
2. Allowing resource lookups
   1. Resource lookups are not used in any of the core CDK constructs, instead
      they are something that the end user would use to get an object that
      would be an input to a core construct.
   2. There is no data on how frequently these are used by end users, but they
      are definitely used more frequently in migration cases since this allows
      you to reference resources created elsewhere.
