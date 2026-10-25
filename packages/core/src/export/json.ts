import { type DiagramDocument, type DiagramLayout, DiagramLayoutSchema } from '../document.ts';
import { migrateDocument } from '../migrations.ts';
import {
  type ArchitectureGraph,
  type ArchNode,
  ArchEdgeSchema,
  ArchitectureGraphSchema,
  ArchNodeSchema,
  NodeAttributesSchema,
} from '../schema.ts';
import { type ParseResult, parseArchitectureGraph, type ValidationIssue } from '../validate.ts';

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
  return JSON.stringify(orderGraph(graph), null, 2);
}

export interface DocumentJsonOptions {
  /** Spaces per level; 0 writes compact JSON, as shared links do. Defaults to 2. */
  readonly indent?: number;
}

/**
 * A diagram with its layout (`{ graph, layout }`), as the editor saves,
 * downloads and shares it. The graph keeps the order of `toJson`, and layout
 * entries follow the order of the nodes, so the text is stable too.
 */
export function documentToJson(
  document: DiagramDocument,
  options: DocumentJsonOptions = {},
): string {
  const { graph, layout } = document;
  const inNodeOrder = <T>(record: Readonly<Record<string, T>>) =>
    Object.fromEntries(
      graph.nodes
        .filter((node) => Object.hasOwn(record, node.id))
        .map((node) => [node.id, record[node.id]]),
    );
  const ordered = {
    graph: orderGraph(graph),
    layout: { positions: inNodeOrder(layout.positions), sizes: inNodeOrder(layout.sizes) },
  };
  return JSON.stringify(ordered, null, options.indent ?? 2);
}

function orderGraph(graph: ArchitectureGraph): Record<string, unknown> {
  return {
    ...pickInOrder(graph, GRAPH_KEYS),
    nodes: graph.nodes.map(orderNode),
    edges: graph.edges.map((edge) => pickInOrder(edge, EDGE_KEYS)),
  };
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
  const data = parseJson(text);
  return data.success ? parseGraphData(data.value) : data;
}

export type DocumentImportResult =
  | {
      readonly success: true;
      readonly graph: ArchitectureGraph;
      /**
       * Positions and sizes, limited to the nodes of the graph; it can miss
       * some of them. Null when the text is a bare graph without a layout.
       */
      readonly layout: DiagramLayout | null;
      readonly warnings: ValidationIssue[];
    }
  | { readonly success: false; readonly issues: ValidationIssue[] };

/**
 * Reads a diagram as the editor saves and shares it, `{ graph, layout }`, or
 * a bare graph as `toJson` writes it. The graph goes through the same steps
 * as `importJson`; the layout is checked with its schema. Never throws.
 */
export function importDocument(text: string): DocumentImportResult {
  const data = parseJson(text);
  if (!data.success) return data;
  const value = data.value;
  const envelope = isObject(value) && 'graph' in value ? value : null;

  const parsed = parseGraphData(envelope ? envelope.graph : value);
  if (!parsed.success) return parsed;
  if (!envelope || envelope.layout === undefined) {
    return { success: true, graph: parsed.graph, layout: null, warnings: parsed.warnings };
  }

  const layout = DiagramLayoutSchema.safeParse(envelope.layout);
  if (!layout.success) {
    return {
      success: false,
      issues: layout.error.issues.map((issue) => ({
        code: 'SCHEMA',
        severity: 'error',
        message: `layout.${issue.path.map(String).join('.')}: ${issue.message}`,
        path: ['layout', ...issue.path],
      })),
    };
  }
  const ids = new Set(parsed.graph.nodes.map((node) => node.id));
  const known = <T>(record: Readonly<Record<string, T>>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => ids.has(id)));
  return {
    success: true,
    graph: parsed.graph,
    layout: { positions: known(layout.data.positions), sizes: known(layout.data.sizes) },
    warnings: parsed.warnings,
  };
}

function parseJson(
  text: string,
): { success: true; value: unknown } | { success: false; issues: ValidationIssue[] } {
  try {
    return { success: true, value: JSON.parse(text) };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      success: false,
      issues: [{ code: 'INVALID_JSON', severity: 'error', message: `Not valid JSON: ${reason}` }],
    };
  }
}

function parseGraphData(data: unknown): ParseResult {
  const migrated = migrateDocument(data);
  if (!migrated.success) return { success: false, issues: [migrated.issue] };
  return parseArchitectureGraph(migrated.document);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
