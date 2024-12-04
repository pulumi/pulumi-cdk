import * as path from 'path';
import * as docker from '@pulumi/docker-build';
import { NetworkMode } from '@pulumi/docker-build';
import * as pulumi from '@pulumi/pulumi';
import * as ccapi from '@pulumi/aws-native';
import * as cdk from 'aws-cdk-lib/core';
import { translateCfnTokenToAssetToken } from 'aws-cdk-lib/core/lib/helpers-internal';
import * as aws from '@pulumi/aws';
import { CdkConstruct } from './interop';
import { zipDirectory } from './zip';
import { asString } from './output';
import { CdkAdapterError } from './types';

/**
 * Deploy time assets will be put in this S3 bucket prefix
 * so that separate lifecycle rules can apply
 */
const DEPLOY_TIME_PREFIX = 'deploy-time/';

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
     * The maximum number of image versions to store in a repository.
     *
     * Previous versions of an image can be stored for rollback purposes.
     * Once a repository has more than 3 image versions stored, the oldest
     * version will be discarded. This allows for sensible garbage collection
     * while maintaining a few previous versions for rollback scenarios.
     *
     * @default - up to 3 versions stored
     */
    readonly imageAssetVersionCount?: number;

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

    /**
     * Returns the name of the staging bucket that will be used to store assets
     * and custom resource responses.
     */
    public abstract getStagingBucket(): pulumi.Input<string>;

    /**
     * Returns the S3 key prefix that will be used for deploy time assets.
     */
    public getDeployTimePrefix(): string {
        return DEPLOY_TIME_PREFIX;
    }
}

/**
 * Information on the created ECR repository
 */
interface CreateRepoResponse {
    /**
     * The name of the created repository
     */
    repoName: string;

    /**
     * The ECR repository that was created
     */
    repo: aws.ecr.Repository;
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
    private readonly imageAssetVersionCount: number;

    /**
     * The final Pulumi name of the asset S3 bucket
     */
    private pulumiBucketLogicalId: string;

    /**
     * The region from the pulumi provider
     */
    private readonly pulumiRegion: pulumi.Output<string>;

    /**
     * The url suffix for the S3 bucket URL
     */
    private readonly urlSuffix: pulumi.Output<string>;

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
    private readonly seenFileAssets = new Map<string, aws.s3.BucketObjectv2>();

    /**
     * Map of `${assetName}:${assetHash}` to docker.Image that have already been created.
     * The same asset could be registered multiple times, but we
     * only want to upload it a single time
     */
    private readonly seenImageAssets = new Map<string, docker.Image>();

    constructor(props: PulumiSynthesizerOptions) {
        super();
        const stackPrefix = props.stagingStackNamePrefix ?? 'staging-stack';
        this._stagingBucketName = props.stagingBucketName;
        this.autoDeleteStagingAssets = props.autoDeleteStagingAssets ?? true;
        this.appId = this.validateAppId(props.appId);
        this.imageAssetVersionCount = props.imageAssetVersionCount ?? 3;

        this.pulumiRegion = aws.getRegionOutput({}, { parent: props.parent }).name;
        this.urlSuffix = ccapi.getUrlSuffixOutput({ parent: props.parent }).urlSuffix;
        this.pulumiBucketLogicalId = this._stagingBucketName ?? `pulumi-cdk-${this.appId}-staging`;

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
     * This will create a unique ECR repository for each asset. Creating a separate repository for each
     * asset allows us to have a lifecycle policy on the repository to delete old images.
     *
     * @param asset - The cdk asset to create a repo for
     * @returns Information about the created repo
     */
    private getCreateRepo(asset: cdk.DockerImageAssetSource): CreateRepoResponse {
        if (!asset.assetName) {
            throw new CdkAdapterError("Docker image assets must include 'assetName' in the asset source definition");
        }
        const repoName = `${this.appId}/${asset.assetName}`
            .toLocaleLowerCase()
            .replace('.', '-')
            // it can only start with letters or numbers
            .replace(/^[^a-z0-9]+/, '');

        if (!this.stagingRepos[repoName]) {
            const repo = new aws.ecr.Repository(
                repoName,
                {
                    // prevents you from pushing an image with a tag that already exists in the repository
                    // @see https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html
                    imageTagMutability: 'IMMUTABLE',
                    forceDelete: this.autoDeleteStagingAssets,
                },
                {
                    retainOnDelete: !this.autoDeleteStagingAssets,
                    parent: this.stagingStack,
                },
            );
            new aws.ecr.LifecyclePolicy(
                'lifecycle-policy',
                {
                    repository: repo.name,
                    policy: {
                        rules: [
                            {
                                action: { type: 'expire' },
                                selection: {
                                    countType: 'imageCountMoreThan',
                                    tagStatus: 'any',
                                    countNumber: this.imageAssetVersionCount,
                                },
                                rulePriority: 1,
                                description: 'Garbage collect old image versions',
                            },
                        ],
                    },
                },
                { parent: this.stagingStack },
            );
            this.stagingRepos[repoName] = repo;
        }
        return {
            repoName,
            repo: this.stagingRepos[repoName],
        };
    }

    /**
     * Create a S3 Bucket which will be used to store any file assets that are created in the
     * CDK application.
     */
    private getCreateBucket(): aws.s3.BucketV2 {
        if (!this.stagingBucket) {
            this.stagingBucket = new aws.s3.BucketV2(
                this.pulumiBucketLogicalId,
                {
                    forceDestroy: this.autoDeleteStagingAssets,
                },
                {
                    retainOnDelete: !this.autoDeleteStagingAssets,
                    parent: this.stagingStack,
                },
            );

            const encryption = new aws.s3.BucketServerSideEncryptionConfigurationV2(
                `${this.pulumiBucketLogicalId}-encryption`,
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
                `${this.pulumiBucketLogicalId}-versioning`,
                {
                    bucket: this.stagingBucket.bucket,
                    versioningConfiguration: {
                        status: 'Enabled',
                    },
                },
                { parent: this.stagingStack },
            );

            const lifecycle = new aws.s3.BucketLifecycleConfigurationV2(
                `${this.pulumiBucketLogicalId}-lifecycle`,
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
                `${this.pulumiBucketLogicalId}-policy`,
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

    public getStagingBucket(): pulumi.Input<string> {
        const bucket = this.getCreateBucket();
        assertBound(bucket);
        return bucket.bucket;
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
     *
     * @hidden
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
     *
     * @hidden
     */
    public bind(stack: cdk.Stack) {
        super.bind(stack);
        const app = cdk.App.of(stack);
        if (!cdk.App.isApp(app)) {
            throw new Error(`Stack ${stack.stackName} must be created within an App`);
        }
        this.outdir = app.assetOutdir;
    }

    /**
     * This method is called by CDK constructs to add a file asset to the stack
     * Usually the default synthesizers will then take the data and add it to the asset manifest
     * for the stack. In our case we can just directly upload the files and then we don't have to
     * later post-process the assets from the manifest
     *
     * @hidden
     */
    public addFileAsset(asset: cdk.FileAssetSource): cdk.FileAssetLocation {
        if (asset.fileName === this.boundStack.templateFile) {
            // This isn't going to be used so the actual bucketName doesn't need to be correct
            // We won't be uploading the template to S3
            return this.cloudFormationLocationFromFileAsset(
                this.assetManifest.defaultAddFileAsset(this.boundStack, asset, {
                    bucketName: translateCfnTokenToAssetToken(this.pulumiBucketLogicalId),
                    bucketPrefix: asset.deployTime ? DEPLOY_TIME_PREFIX : undefined,
                }),
            );
        }
        const stagingBucket = this.getCreateBucket();
        assertBound(this.outdir);

        if (asset.executable || !asset.fileName) {
            throw new CdkAdapterError(`file assets produced by commands are not yet supported`);
        }

        const location = this.assetManifest.defaultAddFileAsset(this.boundStack, asset, {
            // this can't contain Output values so just use the LogicalId. This Information
            // is just for debugging purposes so the correct value isn't necessary
            bucketName: this.pulumiBucketLogicalId,
            bucketPrefix: asset.deployTime ? DEPLOY_TIME_PREFIX : undefined,
        });

        // Assets can be registered multiple times, but we should only create the resource once
        if (this.seenFileAssets.has(asset.sourceHash)) {
            return this.locationFromFileAsset(asset.sourceHash);
        }

        const assetFile = path.join(this.outdir, asset.fileName);
        const outputPath =
            asset.packaging === cdk.FileAssetPackaging.ZIP_DIRECTORY
                ? zipDirectory(assetFile, assetFile + '.zip')
                : assetFile;

        const fileAsset = new pulumi.asset.FileAsset(outputPath);

        const object = new aws.s3.BucketObjectv2(
            `${this.stagingStack.name}/${asset.sourceHash}`,
            {
                source: fileAsset,
                bucket: stagingBucket.bucket,
                key: location.objectKey,
            },
            {
                parent: this.stagingStack,
                dependsOn: this.fileDependencies,
                // We have lifecycle policies on the bucket to handle
                // object deletion. If the asset hash changes and we upload
                // a new object we don't want to necessarily delete the old one
                retainOnDelete: true,
            },
        );
        this.seenFileAssets.set(asset.sourceHash, object);
        return this.locationFromFileAsset(asset.sourceHash);
    }

    private locationFromFileAsset(assetSourceHash: string): cdk.FileAssetLocation {
        assertBound(this.stagingBucket);
        const fileAsset = this.seenFileAssets.get(assetSourceHash)!;
        const httpUrl = asString(
            pulumi.interpolate`https://s3.${this.pulumiRegion}.${this.urlSuffix}/${this.stagingBucket.bucket}/${fileAsset.key}`,
        );
        const s3ObjectUrl = asString(pulumi.interpolate`s3://${this.stagingBucket.bucket}/${fileAsset.key}`);
        return {
            bucketName: asString(this.stagingBucket.bucket),
            objectKey: asString(fileAsset.key),
            s3ObjectUrl: s3ObjectUrl,
            httpUrl,
        };
    }

    /**
     * Gets registry credentials for the given ECR repository
     *
     * @param repo - The ECR repository to get the credentials for
     * @returns The registry credentials for the ECR repository
     */
    private getEcrCredentialsOutput(repo: aws.ecr.Repository): docker.types.input.RegistryArgs {
        const ecrCredentials = aws.ecr.getCredentialsOutput(
            {
                registryId: repo.registryId,
            },
            { parent: this.stagingStack },
        );
        return ecrCredentials.authorizationToken.apply((token) => {
            const decodedCredentials = Buffer.from(token, 'base64').toString();
            const [username, password] = decodedCredentials.split(':');
            if (!password || !username) {
                throw new Error('Invalid credentials');
            }
            return {
                address: ecrCredentials.proxyEndpoint,
                username: username,
                password: password,
            };
        });
    }

    /**
     * This method is called by CDK constructs to add an image asset to the stack
     * Usually the default synthesizers will then take the data and add it to the asset manifest
     * for the stack. In our case we can just directly push the images and then we don't have to
     * later post-process the assets from the manifest
     *
     * @hidden
     *
     * @param asset - The cdk asset to add
     * @returns The location of the asset. This will be the reference to the image ref
     */
    addDockerImageAsset(asset: cdk.DockerImageAssetSource): cdk.DockerImageAssetLocation {
        assertBound(this.outdir);
        if (asset.executable || !asset.directoryName) {
            throw new CdkAdapterError(`Docker image assets produced by commands are not yet supported`);
        }

        const { repoName, repo } = this.getCreateRepo(asset);
        const imageTag = asset.sourceHash;
        const canonicalImageName = pulumi.interpolate`${repo.repositoryUrl}:${imageTag}`;
        const context = path.join(this.outdir, asset.directoryName);
        const dockerFile = path.join(context, asset.dockerFile ?? 'Dockerfile');
        const assetKey = `${asset.assetName}:${asset.sourceHash}`;

        // Assets can be registered multiple times, but we should only create the resource once
        if (this.seenImageAssets.has(assetKey)) {
            return {
                repositoryName: asString(repo.name),
                imageUri: asString(this.seenImageAssets.get(assetKey)!.ref),
            };
        }

        const registryCredentials = this.getEcrCredentialsOutput(repo);

        const cacheFrom = fromCdkCacheFrom(asset.dockerCacheFrom);
        const cacheTo = fromCdkCacheTo(asset.dockerCacheTo);

        const image = new docker.Image(
            `${this.stagingStack.name}/${asset.assetName}`,
            {
                cacheFrom,
                cacheTo,
                push: true,
                dockerfile: {
                    location: dockerFile,
                },
                network: asNetworkMode(asset.networkMode),
                ssh: asset.dockerBuildSsh
                    ? [
                          {
                              id: 'default',
                              paths: [asset.dockerBuildSsh],
                          },
                      ]
                    : undefined,
                target: asset.dockerBuildTarget,
                platforms: asPlatforms(asset.platform),
                // TODO: add support for dockerOutputs
                // this will require parsing strings into the export type
                // exports: asset.dockerOutputs,
                secrets: asset.dockerBuildSecrets,
                tags: [canonicalImageName],
                buildArgs: asset.dockerBuildArgs,
                noCache: asset.dockerCacheDisabled,
                context: {
                    location: context,
                },
                registries: [registryCredentials],
            },
            {
                parent: this.stagingStack,
                // we have a lifecycle policy on the ECR repository to delete old images
                retainOnDelete: true,
            },
        );

        this.assetManifest.defaultAddDockerImageAsset(this.boundStack, asset, {
            repositoryName: repoName,
        });
        this.seenImageAssets.set(assetKey, image);

        return {
            repositoryName: asString(repo.name),
            imageUri: asString(image.ref),
        };
    }

    /**
     * We synthesize the template and the asset manifest
     *
     * @hidden
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

/**
 * Converts the CDK DockerCacheOption to the Pulumi Docker.CacheToArgs
 */
function fromCdkCacheTo(cacheTo?: cdk.DockerCacheOption): docker.types.input.CacheToArgs[] | undefined {
    if (!cacheTo) {
        return undefined;
    }
    return [{ [cacheTo.type]: cacheTo.params }];
}

/**
 * Converts the CDK DockerCacheOption to the Pulumi Docker.CacheFromArgs
 */
function fromCdkCacheFrom(cacheFrom?: cdk.DockerCacheOption[]): docker.types.input.CacheFromArgs[] | undefined {
    if (!cacheFrom) {
        return undefined;
    }
    return cacheFrom.map((cache) => {
        return {
            [cache.type]: cache.params,
        };
    });
}

/**
 * Converts the CDK NetworkMode to the Pulumi Docker.NetworkMode
 *
 * @hidden
 *
 * @param networkMode - The cdk network mode
 * @returns The docker network mode
 */
export function asNetworkMode(networkMode?: string): docker.NetworkMode | undefined {
    if (networkMode === undefined) {
        return undefined;
    }
    const acceptedModes = Object.values(NetworkMode) as string[];
    if (!acceptedModes.includes(networkMode)) {
        throw new Error(`Unsupported network mode: ${networkMode}`);
    }

    return networkMode as NetworkMode;
}

/**
 * Converts the CDK Platform to the Pulumi Docker.Platform
 *
 * @hidden
 *
 * @param platform - The cdk platform
 * @returns The docker platform
 */
export function asPlatforms(platform?: string): docker.Platform[] | undefined {
    if (!platform) {
        return undefined;
    }

    const acceptedPlatforms = Object.values(docker.Platform) as string[];
    if (!acceptedPlatforms.includes(platform)) {
        throw new Error(`Unsupported platform: ${platform}`);
    }

    return [platform as docker.Platform];
}
