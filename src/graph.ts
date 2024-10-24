// Copyright 2016-2022, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { debug } from '@pulumi/pulumi/log';
import { CloudFormationResource } from './cfn';
import { parseSub } from './sub';
import { ConstructTree, StackManifest } from './assembly';

/**
 * Represents a CDK Construct
 */
export interface ConstructInfo {
    /**
     * The construct path
     */
    path: string;

    /**
     * The node id of the construct
     */
    id: string;

    /**
     * The CloudFormation resource type
     *
     * This will only be set if this is the construct for cfn resource
     */
    type?: string;

    /**
     * The attributes of the construct
     */
    attributes?: { [key: string]: any };

    /**
     * The parent construct (i.e. scope)
     * Will be undefined for the construct representing the `Stack`
     */
    parent?: ConstructInfo;
}

export interface GraphNode {
    incomingEdges: Set<GraphNode>;
    outgoingEdges: Set<GraphNode>;
    /**
     * The CFN LogicalID.
     *
     * This will only be set if this node represents a CloudFormation resource.
     * It will not be set for wrapper constructs
     */
    logicalId?: string;

    /**
     * The info on the Construct this node represents
     */
    construct: ConstructInfo;

    /**
     * The CloudFormation resource data for the resource represented by this node.
     * This will only be set if this node represents a cfn resource (not a wrapper construct)
     */
    resource?: CloudFormationResource;
}

/**
 * Get the 'type' from the CFN Type
 * `AWS::S3::Bucket` => `Bucket`
 *
 * @param cfnType - The CloudFormation type (i.e. AWS::S3::Bucket)
 * @returns The resource type (i.e. Bucket)
 */
function typeFromCfn(cfnType: string): string {
    const typeParts = cfnType.split('::');
    if (typeParts.length !== 3) {
        throw new Error(`Expected cfn type in format 'AWS::Service::Resource', got ${cfnType}`);
    }
    return typeParts[2];
}

function typeFromFqn(fqn: string): string {
    const fqnParts = fqn.split('.');
    const mod = fqnParts.slice(0, fqnParts.length - 1).join('/');
    const type = fqnParts[fqnParts.length - 1];
    return `${mod}:${type}`;
}

export class GraphBuilder {
    // Allows for easy access to the GraphNode of a specific Construct
    constructNodes: Map<ConstructInfo, GraphNode>;
    // Map of resource logicalId to GraphNode. Allows for easy lookup by logicalId
    cfnElementNodes: Map<string, GraphNode>;

    constructor(private readonly stack: StackManifest) {
        this.constructNodes = new Map<ConstructInfo, GraphNode>();
        this.cfnElementNodes = new Map<string, GraphNode>();
    }

    // build constructs a dependency graph from the adapter and returns its nodes sorted in topological order.
    public static build(stack: StackManifest): GraphNode[] {
        const b = new GraphBuilder(stack);
        return b._build();
    }

    /**
     * Recursively parses the construct tree to create:
     * - constructNodes
     * - cfnElementNodes
     *
     * @param tree - The construct tree of the current construct being parsed
     * @param parent - The parent construct of the construct currently being parsed
     */
    private parseTree(tree: ConstructTree, parent?: ConstructInfo) {
        const construct: ConstructInfo = {
            parent,
            id: tree.id,
            path: tree.path,
            type: tree.constructInfo ? typeFromFqn(tree.constructInfo.fqn) : tree.id,
            attributes: tree.attributes,
        };
        const node: GraphNode = {
            incomingEdges: new Set<GraphNode>(),
            outgoingEdges: new Set<GraphNode>(),
            construct,
        };
        if (tree.attributes && 'aws:cdk:cloudformation:type' in tree.attributes) {
            const cfnType = tree.attributes['aws:cdk:cloudformation:type'] as string;
            const logicalId = this.stack.logicalIdForPath(tree.path);
            const resource = this.stack.resourceWithLogicalId(logicalId);
            const typ = typeFromCfn(cfnType);
            node.construct.type = typ;
            construct.type = typ;
            if (resource.Type === cfnType) {
                node.resource = resource;
                node.logicalId = logicalId;
                this.cfnElementNodes.set(logicalId, node);
            } else {
                throw new Error(
                    `Something went wrong: resourceType ${resource.Type} does not equal CfnType ${cfnType}`,
                );
            }
        }
        this.constructNodes.set(construct, node);
        if (tree.children) {
            Object.values(tree.children).forEach((child) => this.parseTree(child, construct));
        }
    }

    private _build(): GraphNode[] {
        // passes
        // 1. collect all constructs into a map from construct name to DAG node, converting CFN elements to fragments
        // 2. hook up dependency edges
        // 3. sort the dependency graph

        // Create graph nodes and associate them with constructs and CFN logical IDs.
        //
        // NOTE: this doesn't handle cross-stack references. We'll likely need to do so, at least for nested stacks.
        this.parseTree(this.stack.constructTree);

        for (const [construct, node] of this.constructNodes) {
            // No parent means this is the construct that represents the `Stack`
            if (construct.parent !== undefined) {
                const parentNode = this.constructNodes.get(construct.parent)!;
                node.outgoingEdges.add(parentNode);
                parentNode.incomingEdges.add(node);
            }

            // Then this is the construct representing the CFN resource (i.e. not a wrapper construct)
            if (node.resource && node.logicalId) {
                const source = this.cfnElementNodes.get(node.logicalId!)!;
                this.addEdgesForCfnResource(node.resource, source);

                const dependsOn =
                    typeof node.resource.DependsOn === 'string' ? [node.resource.DependsOn] : node.resource.DependsOn;
                if (dependsOn !== undefined) {
                    for (const target of dependsOn) {
                        this.addEdgeForRef(target, source);
                    }
                }
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
            if (!node.resource && node.incomingEdges.size == 0) {
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

    private addEdgesForCfnResource(obj: any, source: GraphNode): void {
        // Since we are processing the final CloudFormation template, strings will always
        // be the fully resolved value
        if (typeof obj === 'string') {
            return;
        }

        if (typeof obj !== 'object') {
            return;
        }

        if (Array.isArray(obj)) {
            obj.map((x) => this.addEdgesForCfnResource(x, source));
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
            this.addEdgesForCfnResource(v, source);
        }
    }

    private addEdgeForRef(args: any, source: GraphNode) {
        if (typeof args !== 'string') {
            // Ignore these--they are either malformed references or Pulumi outputs.
            return;
        }
        const targetLogicalId = args;

        debug(`ref to ${args}`);
        if (!targetLogicalId.startsWith('AWS::')) {
            const targetNode = this.cfnElementNodes.get(targetLogicalId);
            if (targetNode === undefined) {
                debug(`missing node for target element ${targetLogicalId}`);
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

                    this.addEdgesForCfnResource(vars, source);

                    for (const part of parseSub(template).filter((p) => p.ref !== undefined)) {
                        this.addEdgeForRef(part.ref!.id, source);
                    }
                }
                break;
            default:
                this.addEdgesForCfnResource(params, source);
                break;
        }
    }
}
