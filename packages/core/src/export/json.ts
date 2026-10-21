import { migrateDocument } from '../migrations.ts';
import {
  type ArchitectureGraph,
  type ArchNode,
  ArchEdgeSchema,
  ArchitectureGraphSchema,
  ArchNodeSchema,
  NodeAttributesSchema,
} from '../schema.ts';
import { type ParseResult, parseArchitectureGraph } from '../validate.ts';

/**
 * JSON is the native file format: `toJson` writes it and `importJson` reads it
 * back. Keys follow the order in which the schema declares them, so the same
 * graph always produces the same text and files diff cleanly.
 */

const GRAPH_KEYS = Object.keys(ArchitectureGraphSchema.shape);
const NODE_KEYS = Object.keys(ArchNodeSchema.shape);
const EDGE_KEYS = Object.keys(ArchEdgeSchema.shape);
const ATTRIBUTE_KEYS = Object.keys(NodeAttributesSchema.shape);

/** Pretty printed JSON with a fixed key order. Keys outside the schema are dropped. */
export function toJson(graph: ArchitectureGraph): string {
  const ordered = {
    ...pickInOrder(graph, GRAPH_KEYS),
    nodes: graph.nodes.map(orderNode),
    edges: graph.edges.map((edge) => pickInOrder(edge, EDGE_KEYS)),
  };
  return JSON.stringify(ordered, null, 2);
}

function orderNode(node: ArchNode): Record<string, unknown> {
  // Spreading over an existing key keeps its position, so `attributes` stays in schema order.
  return {
    ...pickInOrder(node, NODE_KEYS),
    ...(node.attributes && { attributes: pickInOrder(node.attributes, ATTRIBUTE_KEYS) }),
  };
}

function pickInOrder(
  source: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}

/**
 * Entry point for diagram files and shared links: parses the text, upgrades
 * older format versions and validates the result with
 * `parseArchitectureGraph`. Never throws.
 */
export function importJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      success: false,
      issues: [{ code: 'INVALID_JSON', severity: 'error', message: `Not valid JSON: ${reason}` }],
    };
  }

  const migrated = migrateDocument(data);
  if (!migrated.success) return { success: false, issues: [migrated.issue] };
  return parseArchitectureGraph(migrated.document);
}
