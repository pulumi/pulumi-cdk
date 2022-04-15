export interface CloudFormationResource {
    readonly Type: string;
    readonly Properties: any;
    readonly Condition?: string;
    readonly DependsOn?: string | string[];
}

export interface CloudFormationTemplate {
    Resources?: { [id: string]: CloudFormationResource };
    Conditions?: { [id: string]: any };
    Outputs?: { [id: string]: any };
}

export function getDependsOn(resource: CloudFormationResource): string[] | undefined {
    return typeof resource.DependsOn === 'string' ? [resource.DependsOn] : resource.DependsOn;
}
