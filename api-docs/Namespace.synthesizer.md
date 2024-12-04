[**@pulumi/cdk**](README.md) • **Docs**

***

[@pulumi/cdk](README.md) / synthesizer

# synthesizer

## Classes

### PulumiSynthesizer

This is a custom synthesizer that determines how the CDK stack should be synthesized.

In our case, since we can create Pulumi resources directly, we don't need a separate bootstrap step.
This is very similar to how the AppStagingSynthesizer works, but is simpler because we don't need to
manage/create a separate CDK stack to manage the resources.

As CDK applications register assets this synthesizer will dynamically create the necessary staging
resources and deploy the assets themselves.

#### See

 - Recommended reading https://github.com/aws/aws-cdk/wiki/Security-And-Safety-Dev-Guide#controlling-the-permissions-used-by-cdk-deployments
 - https://docs.aws.amazon.com/cdk/api/v2/docs/app-staging-synthesizer-alpha-readme.html

#### Extends

- [`PulumiSynthesizerBase`](Namespace.synthesizer.md#pulumisynthesizerbase)

#### Implements

- `IReusableStackSynthesizer`

#### Constructors

##### new PulumiSynthesizer()

> **new PulumiSynthesizer**(`props`): [`PulumiSynthesizer`](Namespace.synthesizer.md#pulumisynthesizer)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `props` | [`PulumiSynthesizerOptions`](Namespace.synthesizer.md#pulumisynthesizeroptions) |

###### Returns

[`PulumiSynthesizer`](Namespace.synthesizer.md#pulumisynthesizer)

###### Overrides

[`PulumiSynthesizerBase`](Namespace.synthesizer.md#pulumisynthesizerbase).[`constructor`](Namespace.synthesizer.md#constructors-1)

###### Defined in

[synthesizer.ts:218](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L218)

#### Properties

| Property | Modifier | Type | Default value | Description | Overrides | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| `stagingBucket?` | `public` | `BucketV2` | `undefined` | The app-scoped, environment-keyed staging bucket. | - | [synthesizer.ts:160](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L160) |
| `stagingRepos` | `readonly` | `Record`\<`string`, `Repository`\> | `{}` | The app-scoped, environment-keyed ecr repositories associated with this app. | - | [synthesizer.ts:165](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L165) |
| `stagingStack` | `readonly` | `CdkConstruct` | `undefined` | The Pulumi ComponentResource wrapper which contains all of the staging resources. This can be added to the `dependsOn` of the main stack to ensure the staging assets are created first | [`PulumiSynthesizerBase`](Namespace.synthesizer.md#pulumisynthesizerbase).`stagingStack` | [synthesizer.ts:155](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L155) |

#### Methods

##### getDeployTimePrefix()

> **getDeployTimePrefix**(): `string`

Returns the S3 key prefix that will be used for deploy time assets.

###### Returns

`string`

###### Inherited from

[`PulumiSynthesizerBase`](Namespace.synthesizer.md#pulumisynthesizerbase).[`getDeployTimePrefix`](Namespace.synthesizer.md#getdeploytimeprefix-1)

###### Defined in

[synthesizer.ts:116](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L116)

##### getStagingBucket()

> **getStagingBucket**(): `Input`\<`string`\>

Returns the name of the staging bucket that will be used to store assets
and custom resource responses.

###### Returns

`Input`\<`string`\>

###### Overrides

[`PulumiSynthesizerBase`](Namespace.synthesizer.md#pulumisynthesizerbase).[`getStagingBucket`](Namespace.synthesizer.md#getstagingbucket-1)

###### Defined in

[synthesizer.ts:417](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L417)

***

### `abstract` PulumiSynthesizerBase

Base Synthesizer class. If you want to implement your own Pulumi Synthesizer which
creates Pulumi resources then you should extend this class.

#### Extends

- `StackSynthesizer`

#### Extended by

- [`PulumiSynthesizer`](Namespace.synthesizer.md#pulumisynthesizer)

#### Constructors

##### new PulumiSynthesizerBase()

> **new PulumiSynthesizerBase**(): [`PulumiSynthesizerBase`](Namespace.synthesizer.md#pulumisynthesizerbase)

###### Returns

[`PulumiSynthesizerBase`](Namespace.synthesizer.md#pulumisynthesizerbase)

###### Inherited from

`cdk.StackSynthesizer.constructor`

#### Properties

| Property | Modifier | Type | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| `stagingStack` | `abstract` | `CdkConstruct` | The Pulumi ComponentResource wrapper which contains all of the staging resources. This can be added to the `dependsOn` of the main stack to ensure the staging assets are created first | [synthesizer.ts:105](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L105) |

#### Methods

##### getDeployTimePrefix()

> **getDeployTimePrefix**(): `string`

Returns the S3 key prefix that will be used for deploy time assets.

###### Returns

`string`

###### Defined in

[synthesizer.ts:116](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L116)

##### getStagingBucket()

> `abstract` **getStagingBucket**(): `Input`\<`string`\>

Returns the name of the staging bucket that will be used to store assets
and custom resource responses.

###### Returns

`Input`\<`string`\>

###### Defined in

[synthesizer.ts:111](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L111)

## Interfaces

### PulumiSynthesizerOptions

#### Properties

| Property | Modifier | Type | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| `appId` | `readonly` | `string` | A unique identifier for the application that the staging stack belongs to. This identifier will be used in the name of staging resources created for this application, and should be unique across CDK apps. The identifier should include lowercase characters, numbers, periods (.) and dashes ('-') only and have a maximum of 17 characters. | [synthesizer.ts:30](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L30) |
| `autoDeleteStagingAssets?` | `readonly` | `boolean` | Auto deletes objects in the staging S3 bucket and images in the staging ECR repositories. This will also delete the S3 buckets and ECR repositories themselves when all objects / images are removed. **Default** `true` | [synthesizer.ts:75](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L75) |
| `deployTimeFileAssetLifetime?` | `readonly` | `Duration` | The lifetime for deploy time file assets. Assets that are only necessary at deployment time (for instance, CloudFormation templates and Lambda source code bundles) will be automatically deleted after this many days. Assets that may be read from the staging bucket during your application's run time will not be deleted. Set this to the length of time you wish to be able to roll back to previous versions of your application without having to do a new `cdk synth` and re-upload of assets. **Default** `- Duration.days(30)` | [synthesizer.ts:54](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L54) |
| `imageAssetVersionCount?` | `readonly` | `number` | The maximum number of image versions to store in a repository. Previous versions of an image can be stored for rollback purposes. Once a repository has more than 3 image versions stored, the oldest version will be discarded. This allows for sensible garbage collection while maintaining a few previous versions for rollback scenarios. **Default** `- up to 3 versions stored` | [synthesizer.ts:87](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L87) |
| `parent?` | `readonly` | `Resource` | The parent resource for any Pulumi resources created by the Synthesizer | [synthesizer.ts:92](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L92) |
| `stagingBucketName?` | `readonly` | `string` | Explicit name for the staging bucket **Default** `- a well-known name unique to this app/env.` | [synthesizer.ts:37](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L37) |
| `stagingStackNamePrefix?` | `readonly` | `string` | Specify a custom prefix to be used as the staging stack name and construct ID. The prefix will be appended before the appId, which is required to be part of the stack name and construct ID to ensure uniqueness. **Default** `'staging-stack'` | [synthesizer.ts:64](https://github.com/pulumi/pulumi-cdk/blob/main/src/synthesizer.ts#L64) |
