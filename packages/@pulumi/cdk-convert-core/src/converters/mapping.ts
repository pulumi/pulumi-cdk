export interface Mapping<TResource = any, TValue = any> {
    /**
     * The main resource that is being mapped.
     */
    resource: TResource;

    /**
     * The CloudFormation resource type represented by this mapping (e.g., AWS::S3::Bucket).
     */
    resourceType: string;

    /**
     * Additional resources created as a side effect of this mapping (e.g., IAM attachments).
     */
    otherResources?: TResource[];

    /**
     * Optional attribute overrides exposed by this mapping. When undefined, attribute names are
     * expected to be translated from CloudFormation naming automatically.
     */
    attributes?: { [name: string]: TValue };
}
