import * as cdk from 'aws-cdk-lib';
import * as pulumi from '@pulumi/pulumi';
import { CdkResource, normalize, firstToLower } from './interop';
import { Stack, CfnElement, Aspects, Token } from 'aws-cdk-lib';
import { Construct, ConstructOrder, Node, IConstruct } from 'constructs';
import { CloudFormationTemplate } from './cfn';

export interface GraphNode {
    incomingEdges: Set<GraphNode>;
    outgoingEdges: Set<GraphNode>;
    construct: Construct;
    template?: CloudFormationTemplate;
}

export class GraphBuilder {
    constructNodes: Map<Construct, GraphNode>;
    cfnElementNodes: Map<string, GraphNode>;

    constructor(private readonly host: Stack) {
        this.constructNodes = new Map<Construct, GraphNode>();
        this.cfnElementNodes = new Map<string, GraphNode>();
    }

    // build constructs a dependency graph from the adapter and returns its nodes sorted in topological order.
    public static build(host: Stack): GraphNode[] {
        const b = new GraphBuilder(host);
        return b._build();
    }

    private _build(): GraphNode[] {
        // passes
        // 1. collect all constructs into a map from construct name to DAG node, converting CFN elements to fragments
        // 2. hook up dependency edges
        // 3. sort the dependency graph

        // Create graph nodes and associate them with constructs and CFN logical IDs.
        //
        // NOTE: this doesn't handle cross-stack references, but that should be OK: IIUC we are operating within the
        // context of a single CFN stack by design.
        for (const construct of this.host.node.findAll(ConstructOrder.POSTORDER)) {
            if (Stack.isStack(construct)) {
                continue;
            }

            const template = CfnElement.isCfnElement(construct)
                ? (this.host.resolve((construct as any)._toCloudFormation()) as CloudFormationTemplate)
                : undefined;

            const node = {
                incomingEdges: new Set<GraphNode>(),
                outgoingEdges: new Set<GraphNode>(),
                construct: construct,
                template: template,
            };

            this.constructNodes.set(construct, node);
            if (CfnElement.isCfnElement(construct)) {
                const logicalId = this.host.resolve(construct.logicalId);
                this.cfnElementNodes.set(logicalId, node);
            }
        }

        // Add dependency edges.
        for (const [construct, node] of this.constructNodes) {
            if (construct.node.scope !== undefined && !Stack.isStack(construct.node.scope)) {
                const parentNode = this.constructNodes.get(construct.node.scope)!;
                node.outgoingEdges.add(parentNode);
                parentNode.incomingEdges.add(node);
            }

            if (node.template !== undefined) {
                this.addEdgesForTemplate(node.template);
            }
        }

        // Sort the graph.
        const sorted: GraphNode[] = [];
        const visited = new Set<GraphNode>();
        function sort(node: GraphNode) {
            if (visited.has(node)) {
                return;
            }
            visited.add(node);

            // If this is a non-CFN construct with no incoming edges, ignore it.
            if (!CfnElement.isCfnElement(node.construct) && node.incomingEdges.size == 0) {
                return;
            }

            for (const target of node.outgoingEdges) {
                sort(target);
            }
            sorted.push(node);
        }

        for (const [_, node] of this.constructNodes) {
            sort(node);
        }

        return sorted;
    }

    private addEdgesForTemplate(template: CloudFormationTemplate) {
        for (const [logicalId, value] of Object.entries(template.Resources || {})) {
            const source = this.cfnElementNodes.get(logicalId)!;
            this.addEdgesForFragment(value, source);
        }
    }

    private addEdgesForFragment(obj: any, source: GraphNode): void {
        if (typeof obj === 'string') {
            if (!Token.isUnresolved(obj)) {
                return;
            }
            console.warn(`unresolved token ${obj}`);
            obj = this.host.resolve(obj);
        }

        if (typeof obj !== 'object') {
            return;
        }

        if (Array.isArray(obj)) {
            obj.map((x) => this.addEdgesForFragment(x, source));
            return;
        }

        const ref = obj.Ref;
        if (ref) {
            this.addEdgeForRef(ref, source);
            return;
        }

        const keys = Object.keys(obj);
        if (keys.length == 1 && keys[0]?.startsWith('Fn::')) {
            this.addEdgesForIntrinsic(keys[0], obj[keys[0]], source);
            return;
        }

        for (const v of Object.values(obj)) {
            this.addEdgesForFragment(v, source);
        }
    }

    private addEdgeForRef(targetLogicalId: string, source: GraphNode) {
        if (!targetLogicalId.startsWith('AWS::')) {
            const targetNode = this.cfnElementNodes.get(targetLogicalId);
            if (targetNode === undefined) {
                console.warn(`missing node for target element ${targetLogicalId}`);
            } else {
                source.outgoingEdges.add(targetNode);
                targetNode.incomingEdges.add(source);
            }
        }
    }

    private addEdgesForIntrinsic(fn: string, params: any, source: GraphNode) {
        switch (fn) {
            case 'Fn::GetAtt':
                this.addEdgeForRef(params[0], source);
                break;
            case 'Fn::Sub':
                {
                    const [template, vars] =
                        typeof params === 'string' ? [params, undefined] : [params[0] as string, params[1]];

                    this.addEdgesForFragment(vars, source);

                    const subRegex = /\${([^!][^.}]*)(\.[^}]*)?}/g;
                    for (const m of template.matchAll(subRegex)) {
                        this.addEdgeForRef(m[1], source);
                    }
                }
                break;
            default:
                this.addEdgesForFragment(params, source);
                break;
        }
    }
}
