import * as path from 'path';
import * as pulumi from '@pulumi/pulumi';
import * as cdk from 'aws-cdk-lib/core';
import { translateCfnTokenToAssetToken } from 'aws-cdk-lib/core/lib/helpers-internal';
import * as aws from '@pulumi/aws';
import { CdkConstruct } from './interop';
import { zipDirectory } from './zip';

/**
 * Deploy time assets will be put in this S3 bucket prefix
 * so that separate lifecycle rules can apply
 */
export const DEPLOY_TIME_PREFIX = 'deploy-time/';

export interface PulumiSynthesizerOptions {
    /**
     * A unique identifier for the application that the staging stack belongs to.
     *
     * This identifier will be used in the name of staging resources
     * created for this application, and should be unique across CDK apps.
     *
     * The identifier should include lowercase characters, numbers, periods (.) and dashes ('-') only
     * and have a maximum of 17 characters.
     */
    readonly appId: string;

    /**
     * Explicit name for the staging bucket
     *
     * @default - a well-known name unique to this app/env.
     */
    readonly stagingBucketName?: string;

    /**
     * The lifetime for deploy time file assets.
     *
     * Assets that are only necessary at deployment time (for instance,
     * CloudFormation templates and Lambda source code bundles) will be
     * automatically deleted after this many days. Assets that may be
     * read from the staging bucket during your application's run time
     * will not be deleted.
     *
     * Set this to the length of time you wish to be able to roll back to
     * previous versions of your application without having to do a new
     * `cdk synth` and re-upload of assets.
     *
     * @default - Duration.days(30)
     */
    readonly deployTimeFileAssetLifetime?: cdk.Duration;

    /**
     * Specify a custom prefix to be used as the staging stack name and
     * construct ID. The prefix will be appended before the appId, which
     * is required to be part of the stack name and construct ID to
     * ensure uniqueness.
     *
     * @default 'staging-stack'
     */
    readonly stagingStackNamePrefix?: string;

    /**
     * Auto deletes objects in the staging S3 bucket and images in the
     * staging ECR repositories.
     *
     * This will also delete the S3 buckets and ECR repositories themselves when
     * all objects / images are removed.
     *
     * @default true
     */
    readonly autoDeleteStagingAssets?: boolean;

    /**
     * The parent resource for any Pulumi resources created by the Synthesizer
     */
    readonly parent?: pulumi.Resource;
}

/**
 * Base Synthesizer class. If you want to implement your own Pulumi Synthesizer which
 * creates Pulumi resources then you should extend this class.
 */
export abstract class PulumiSynthesizerBase extends cdk.StackSynthesizer {
    /**
     * The Pulumi ComponentResource wrapper which contains all of the
     * staging resources. This can be added to the `dependsOn` of the main
     * stack to ensure the staging assets are created first
     */
    public abstract readonly stagingStack: CdkConstruct;
}

/**
 * This is a custom synthesizer that determines how the CDK stack should be synthesized.
 *
 * In our case, since we can create Pulumi resources directly, we don't need a separate bootstrap step.
 * This is very similar to how the AppStagingSynthesizer works, but is simpler because we don't need to
 * manage/create a separate CDK stack to manage the resources.
 *
 * As CDK applications register assets this synthesizer will dynamically create the necessary staging
 * resources and deploy the assets themselves.
 *
 * @see Recommended reading https://github.com/aws/aws-cdk/wiki/Security-And-Safety-Dev-Guide#controlling-the-permissions-used-by-cdk-deployments
 * @see https://docs.aws.amazon.com/cdk/api/v2/docs/app-staging-synthesizer-alpha-readme.html
 */
export class PulumiSynthesizer extends PulumiSynthesizerBase implements cdk.IReusableStackSynthesizer {
    /**
     * The Pulumi ComponentResource wrapper which contains all of the
     * staging resources. This can be added to the `dependsOn` of the main
     * stack to ensure the staging assets are created first
     */
    public readonly stagingStack: CdkConstruct;

    /**
     * The app-scoped, environment-keyed staging bucket.
     */
    public stagingBucket?: aws.s3.BucketV2;

    /**
     * The app-scoped, environment-keyed ecr repositories associated with this app.
     */
    public readonly stagingRepos: Record<string, aws.ecr.Repository> = {};

    private readonly appId: string;

    /**
     * A value to use as an override for the bucket name
     */
    private readonly _stagingBucketName?: string;
    private readonly autoDeleteStagingAssets: boolean;

    /**
     * The final CDK name of the asset S3 bucket. This may contain CDK tokens
     */
    private cdkBucketName?: string;

    /**
     * The final Pulumi name of the asset S3 bucket
     */
    private pulumiBucketName?: string | pulumi.Output<string>;

    /**
     * The region from the pulumi provider
     */
    private readonly pulumiRegion: pulumi.Output<string>;

    /**
     * The account id from the pulumi provider
     */
    private readonly pulumiAccount: pulumi.Output<string>;

    /**
     * The accountId which may contain CDK tokens
     */
    private cdkAccount?: string;

    /**
     * The region that may contain CDK tokens
     */
    private cdkRegion?: string;

    /**
     * The resources that any file assets need to depend on
     */
    private readonly fileDependencies: pulumi.Resource[] = [];

    private readonly assetManifest = new cdk.AssetManifestBuilder();

    /**
     * The output directory which contains the asset files.
     * Can be used to generate the absolute path to the asset
     */
    private outdir?: string;

    /**
     * List of asset hashes that have already been uploaded.
     * The same asset could be registered multiple times, but we
     * only want to upload it a single time
     */
    private readonly seenFileAssets = new Set<string>();

    constructor(props: PulumiSynthesizerOptions) {
        super();
        const stackPrefix = props.stagingStackNamePrefix ?? 'staging-stack';
        this._stagingBucketName = props.stagingBucketName;
        this.autoDeleteStagingAssets = props.autoDeleteStagingAssets ?? true;
        this.appId = this.validateAppId(props.appId);

        const account = aws.getCallerIdentity({}, { parent: props.parent }).then((id) => id.accountId);
        this.pulumiAccount = pulumi.output(account);
        const region = aws.getRegion({}, { parent: props.parent }).then((r) => r.name);
        this.pulumiRegion = pulumi.output(region);
        const id = `${stackPrefix}-${this.appId}`;
        // create a wrapper component resource that we can depend on
        this.stagingStack = new CdkConstruct(id, 'StagingStack', { parent: props.parent });
        this.stagingStack.done();
    }

    private validateAppId(id: string) {
        const errors = [];
        if (id.length > 17) {
            errors.push(`appId expected no more than 17 characters but got ${id.length} characters.`);
        }
        if (id !== id.toLocaleLowerCase()) {
            errors.push('appId only accepts lowercase characters.');
        }
        if (!/^[a-z0-9-.]*$/.test(id)) {
            errors.push("appId expects only letters, numbers, periods ('.'), and dashes ('-')");
        }

        if (errors.length > 0) {
            throw new Error([`appId ${id} has errors:`, ...errors].join('\n'));
        }
        return id;
    }

    /**
     * Create a S3 Bucket which will be used to store any file assets that are created in the
     * CDK application.
     */
    private getCreateBucket(): aws.s3.BucketV2 {
        // The pulumi resources can use the actual output values for account/region
        this.pulumiBucketName =
            this._stagingBucketName ??
            pulumi.interpolate`pulumi-cdk-${this.appId}-staging-${this.pulumiAccount}-${this.pulumiRegion}`;

        if (!this.stagingBucket) {
            this.stagingBucket = new aws.s3.BucketV2(
                'pulumi-cdk-staging-bucket',
                {
                    bucket: this.pulumiBucketName,
                    forceDestroy: this.autoDeleteStagingAssets,
                },
                {
                    retainOnDelete: !this.autoDeleteStagingAssets,
                    parent: this.stagingStack,
                },
            );

            const encryption = new aws.s3.BucketServerSideEncryptionConfigurationV2(
                'staging-bucket-encryption',
                {
                    bucket: this.stagingBucket.bucket,
                    rules: [
                        {
                            applyServerSideEncryptionByDefault: {
                                sseAlgorithm: 'AES256',
                            },
                        },
                    ],
                },
                { parent: this.stagingStack },
            );

            // Many AWS account safety checkers will complain when buckets aren't versioned
            const versioning = new aws.s3.BucketVersioningV2(
                'staging-bucket-versioning',
                {
                    bucket: this.stagingBucket.bucket,
                    versioningConfiguration: {
                        status: 'Enabled',
                    },
                },
                { parent: this.stagingStack },
            );

            const lifecycle = new aws.s3.BucketLifecycleConfigurationV2(
                'staging-bucket-lifecycle',
                {
                    bucket: this.stagingBucket.bucket,
                    rules: [
                        {
                            // Objects should never be overwritten, but let's make sure we have a lifecycle policy
                            // for it anyway.
                            id: 'expire-old-versions',
                            noncurrentVersionExpiration: {
                                noncurrentDays: 365,
                            },
                            status: 'Enabled',
                        },
                        {
                            filter: {
                                prefix: 'deploy-time/',
                            },
                            id: 'expire-deploy-time-objects',
                            expiration: { days: 30 },
                            status: 'Enabled',
                        },
                    ],
                },
                { parent: this.stagingStack, dependsOn: [versioning] },
            );

            // Many AWS account safety checkers will complain when SSL isn't enforced
            const policyDoc = pulumi.jsonStringify({
                Version: '2012-10-17',
                Id: 'require-ssl',
                Statement: [
                    {
                        Sid: 'ssl',
                        Action: ['s3:*'],
                        Condition: {
                            Bool: {
                                'aws:SecureTransport': false,
                            },
                        },
                        Effect: 'Deny',
                        Principal: '*',
                        Resource: [this.stagingBucket.arn, pulumi.interpolate`${this.stagingBucket.arn}/*`],
                    },
                ],
            });
            const policy = new aws.s3.BucketPolicy(
                'staging-bucket-policy',
                {
                    bucket: this.stagingBucket.bucket,
                    policy: policyDoc,
                },
                { parent: this.stagingStack },
            );
            this.fileDependencies.push(this.stagingBucket, encryption, versioning, lifecycle, policy);
        }
        return this.stagingBucket;
    }

    /**
     * Retrieves the staging S3 bucket.
     * 
     * This method ensures that the staging bucket is created and bound before returning it.
     * 
     * @returns {aws.s3.BucketV2} The staging S3 bucket.
     * @throws {Error} If the staging bucket is not properly bound.
     */
    public getStagingBucket(): aws.s3.BucketV2 {
        const bucket = this.getCreateBucket();
        assertBound(bucket);
        return bucket;
    }

    /**
     * Produce a bound Stack Synthesizer for the given stack.
     *
     * This method may be called more than once on the same object.
     *
     * NOTE: For our purposes we, we don't need to worry about calling this,
     * it will automatically get called by the underlying CDK stack construct
     * Also, we currently only support a single stack so we don't have to worry
     * about this being created multiple times. If we change the way this library
     * works and allow for multiple stacks we will have to revisit this
     */
    public reusableBind(stack: cdk.Stack): cdk.IBoundStackSynthesizer {
        // Create a copy of the current object and bind that
        const copy = Object.create(this);
        copy.bind(stack);
        return copy;
    }

    /**
     * Bind to the stack this environment is going to be used on
     *
     * Must be called before any of the other methods are called.
     *
     * NOTE: For our purposes we, we don't need to worry about calling this,
     * it will automatically get called by the underlying CDK stack construct
     */
    public bind(stack: cdk.Stack) {
        super.bind(stack);
        const app = cdk.App.of(stack);
        if (!cdk.App.isApp(app)) {
            throw new Error(`Stack ${stack.stackName} must be created within an App`);
        }
        this.outdir = app.assetOutdir;
        this.cdkRegion = stack.region;
        this.cdkAccount = stack.account;
    }

    /**
     * This method is called by CDK constructs to add a file asset to the stack
     * Usually the default synthesizers will then take the data and add it to the asset manifest
     * for the stack. In our case we can just directly upload the files and then we don't have to
     * later post-process the assets from the manifest
     */
    public addFileAsset(asset: cdk.FileAssetSource): cdk.FileAssetLocation {
        assertBound(this.cdkAccount);
        assertBound(this.cdkRegion);
        // The name that CDK uses needs to include CDK intrinsics so we use the CDK account/region
        this.cdkBucketName =
            this._stagingBucketName ?? `pulumi-cdk-${this.appId}-staging-${this.cdkAccount}-${this.cdkRegion}`;
        if (asset.fileName === this.boundStack.templateFile) {
            return this.cloudFormationLocationFromFileAsset(
                this.assetManifest.defaultAddFileAsset(this.boundStack, asset, {
                    bucketName: translateCfnTokenToAssetToken(this.cdkBucketName),
                    bucketPrefix: asset.deployTime ? DEPLOY_TIME_PREFIX : undefined,
                }),
            );
        }
        const stagingBucket = this.getCreateBucket();
        assertBound(this.outdir);

        if (asset.executable || !asset.fileName) {
            throw new Error(`file assets produced by commands are not yet supported`);
        }

        const location = this.assetManifest.defaultAddFileAsset(this.boundStack, asset, {
            bucketName: translateCfnTokenToAssetToken(this.cdkBucketName),
            bucketPrefix: asset.deployTime ? DEPLOY_TIME_PREFIX : undefined,
        });

        // Assets can be registered multiple times, but we should only create the resource once
        if (this.seenFileAssets.has(asset.sourceHash)) {
            return this.cloudFormationLocationFromFileAsset(location);
        }
        this.seenFileAssets.add(asset.sourceHash);

        // Don't upload the CloudFormation template
        if (asset.fileName !== this.boundStack.templateFile) {
            const assetFile = path.join(this.outdir, asset.fileName);
            const outputPath =
                asset.packaging === cdk.FileAssetPackaging.ZIP_DIRECTORY
                    ? zipDirectory(assetFile, assetFile + '.zip')
                    : assetFile;

            new aws.s3.BucketObjectv2(
                `${this.stagingStack.name}/${asset.sourceHash}`,
                {
                    source: outputPath,
                    bucket: stagingBucket.bucket,
                    key: location.objectKey,
                },
                { parent: this.stagingStack, dependsOn: this.fileDependencies },
            );
        }
        return this.cloudFormationLocationFromFileAsset(location);
    }

    addDockerImageAsset(asset: cdk.DockerImageAssetSource): cdk.DockerImageAssetLocation {
        throw new Error('Docker image assets are not supported yet');
    }

    /**
     * We synthesize the template and the asset manifest
     */
    synthesize(session: cdk.ISynthesisSession): void {
        const templateAssetSource = this.synthesizeTemplate(session);
        const templateAsset = this.addFileAsset(templateAssetSource);

        // We still emit the asset manifest for debugging purposes
        // but we don't register the dependency on the stack
        this.assetManifest.emitManifest(this.boundStack, session);

        this.emitArtifact(session, {
            stackTemplateAssetObjectUrl: templateAsset.s3ObjectUrlWithPlaceholders,
        });
    }
}

/**
 * Throw an error message about binding() if we don't have a value for x.
 *
 * This replaces the ! assertions we would need everywhere otherwise.
 */
function assertBound<A>(x: A | undefined): asserts x is NonNullable<A> {
    if (x === null && x === undefined) {
        throw new Error('You must call bindStack() first');
    }
}

export function isPulumiSynthesizer(x: cdk.IStackSynthesizer): x is PulumiSynthesizer {
    return x instanceof PulumiSynthesizer;
}
