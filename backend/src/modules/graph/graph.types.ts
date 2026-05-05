/**
 * Types for the Graph module responses.
 */

export interface GraphNode {
  id: string;
  label: string;
  type: "file" | "function" | "module";
  [key: string]: unknown;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: "DECLARES" | "IMPORTS" | "CALLS";
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type GraphLevel = "architecture" | "file" | "function";
