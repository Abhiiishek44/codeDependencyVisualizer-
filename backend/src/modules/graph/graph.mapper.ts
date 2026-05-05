import { GraphNode, GraphEdge, GraphResponse } from "./graph.types";

/**
 * Map a Neo4j record to a GraphNode.
 */
export const mapNode = (record: Record<string, any>, type: GraphNode["type"]): GraphNode => ({
  id: String(record.id ?? record.name ?? "unknown"),
  label: String(record.name ?? record.path ?? record.id ?? "unknown"),
  type,
});

/**
 * Map a Neo4j relationship record to a GraphEdge.
 */
export const mapEdge = (
  source: string,
  target: string,
  relationship: GraphEdge["relationship"]
): GraphEdge => ({
  source,
  target,
  relationship,
});

/**
 * Map an array of Neo4j result records into a GraphResponse.
 * Deduplicates nodes by ID and edges by source+target+relationship.
 */
export const mapGraphResponse = (
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphResponse => {
  // Deduplicate nodes by id
  const nodeMap = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (node.id && !nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
    }
  }

  // Deduplicate edges
  const edgeSet = new Set<string>();
  const uniqueEdges: GraphEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.source}|${edge.target}|${edge.relationship}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      uniqueEdges.push(edge);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: uniqueEdges,
  };
};
