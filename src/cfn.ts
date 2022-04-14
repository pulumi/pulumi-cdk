export interface CloudFormationResource {
    readonly Type: string;
    readonly Properties: any;
    readonly Condition?: string;
}

export interface CloudFormationTemplate {
    Resources?: { [id: string]: CloudFormationResource };
    Conditions?: { [id: string]: any };
    Outputs?: { [id: string]: any };
}
