import { z } from 'zod';
import {
  ArchEdgeSchema,
  type ArchEdge,
  type ArchitectureGraph,
  ArchitectureGraphSchema,
  ArchNodeSchema,
  type ArchNode,
  IdSchema,
  LIMITS,
  NodeAttributesSchema,
} from './schema.ts';
import { parseArchitectureGraph, type ValidationIssue } from './validate.ts';

/**
 * Edits of a graph as data: what the assistant sends instead of a whole new
 * diagram, so the rest stays where it was and the change can be shown.
 * In `changes`, a field set to `null` is removed; one left out stays as it is.
 */

const node = ArchNodeSchema.shape;
const edge = ArchEdgeSchema.shape;
const graph = ArchitectureGraphSchema.shape;

const attribute = NodeAttributesSchema.shape;

/** Attributes to set, or `null` to forget; the others stay. */
const AttributeChangesSchema = z
  .strictObject({
    replicas: attribute.replicas.unwrap().nullable().optional(),
    multiAz: attribute.multiAz.unwrap().nullable().optional(),
    autoscaling: attribute.autoscaling.unwrap().nullable().optional(),
    publiclyAccessible: attribute.publiclyAccessible.unwrap().nullable().optional(),
    encryptedAtRest: attribute.encryptedAtRest.unwrap().nullable().optional(),
    managed: attribute.managed.unwrap().nullable().optional(),
  })
  .describe('Attributes to set; null forgets one; the ones left out stay');

export const NodeChangesSchema = z.strictObject({
  kind: node.kind.optional(),
  label: node.label.optional(),
  description: node.description.unwrap().nullable().optional(),
  provider: node.provider.unwrap().nullable().optional(),
  service: node.service.unwrap().nullable().optional(),
  parentId: node.parentId
    .unwrap()
    .nullable()
    .optional()
    .describe('Container to move into; null takes it out of any'),
  attachedTo: node.attachedTo.unwrap().nullable().optional(),
  attributes: AttributeChangesSchema.optional(),
  tags: node.tags.unwrap().nullable().optional(),
});

export const EdgeChangesSchema = z.strictObject({
  source: edge.source.optional(),
  target: edge.target.optional(),
  label: edge.label.unwrap().nullable().optional(),
  protocol: edge.protocol.unwrap().nullable().optional(),
  mode: edge.mode.unwrap().nullable().optional(),
});

export const DiagramChangesSchema = z.strictObject({
  title: graph.title.optional(),
  description: graph.description.unwrap().nullable().optional(),
  provider: graph.provider.optional(),
});

export const GraphOperationSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('addNode'), node: ArchNodeSchema }),
  z.strictObject({ op: z.literal('updateNode'), id: IdSchema, changes: NodeChangesSchema }),
  z
    .strictObject({ op: z.literal('removeNode'), id: IdSchema })
    .describe('Also removes its connections; what it contains moves to its container'),
  z.strictObject({ op: z.literal('addEdge'), edge: ArchEdgeSchema }),
  z.strictObject({ op: z.literal('updateEdge'), id: IdSchema, changes: EdgeChangesSchema }),
  z.strictObject({ op: z.literal('removeEdge'), id: IdSchema }),
  z.strictObject({ op: z.literal('updateDiagram'), changes: DiagramChangesSchema }),
]);

/** Enough to rebuild a diagram of the largest size from scratch. */
export const MAX_PATCH_OPERATIONS = LIMITS.maxNodes + LIMITS.maxEdges;

export const GraphPatchSchema = z.array(GraphOperationSchema).max(MAX_PATCH_OPERATIONS);

export type NodeChanges = z.infer<typeof NodeChangesSchema>;
export type EdgeChanges = z.infer<typeof EdgeChangesSchema>;
export type GraphOperation = z.infer<typeof GraphOperationSchema>;
export type GraphPatch = z.infer<typeof GraphPatchSchema>;

/** Ids of what a change added, changed or removed. */
export interface ChangedIds {
  readonly added: string[];
  readonly updated: string[];
  readonly removed: string[];
}

export interface GraphChanges {
  /** Whether the title, the description or the provider of the diagram changed. */
  readonly diagram: boolean;
  readonly nodes: ChangedIds;
  readonly edges: ChangedIds;
}

export interface PatchIssue {
  /** Index of the operation at fault; absent when the problem is the graph as a whole. */
  readonly operation?: number;
  readonly message: string;
}

export type PatchResult =
  | {
      readonly success: true;
      readonly graph: ArchitectureGraph;
      readonly changes: GraphChanges;
      readonly warnings: ValidationIssue[];
    }
  | { readonly success: false; readonly issues: PatchIssue[] };

/** `target` with each change applied: `null` removes the field, `undefined` keeps it. */
function withChanges<T extends object>(target: T, changes: object): T {
  const next: Record<string, unknown> = Object.fromEntries(Object.entries(target));
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete next[key];
    else if (value !== undefined) next[key] = value;
  }
  return next as T;
}

function changeNode(current: ArchNode, changes: NodeChanges): ArchNode {
  const { attributes, ...rest } = changes;
  const next = withChanges(current, rest);
  if (attributes === undefined) return next;
  const merged = withChanges(current.attributes ?? {}, attributes);
  if (Object.keys(merged).length === 0) {
    const { attributes: _, ...withoutAttributes } = next;
    return withoutAttributes;
  }
  return { ...next, attributes: merged };
}

/**
 * Applies `operations` in order to a copy of `graph`. Pure. Every operation is
 * checked and every fault reported, so one round trip can fix them all; the
 * result must then pass `parseArchitectureGraph`, so a patch can never leave
 * the graph invalid.
 */
export function applyPatch(
  graph: ArchitectureGraph,
  operations: readonly GraphOperation[],
): PatchResult {
  let nodes = [...graph.nodes];
  let edges = [...graph.edges];
  let diagram: ArchitectureGraph = graph;
  const issues: PatchIssue[] = [];

  const fail = (operation: number, message: string) => issues.push({ operation, message });
  const nodeAt = (id: string) => nodes.findIndex((candidate) => candidate.id === id);
  const edgeAt = (id: string) => edges.findIndex((candidate) => candidate.id === id);

  operations.forEach((operation, index) => {
    switch (operation.op) {
      case 'addNode':
        if (nodeAt(operation.node.id) !== -1) {
          fail(index, `Node "${operation.node.id}" already exists; use updateNode to change it`);
        } else nodes.push(operation.node);
        break;
      case 'updateNode': {
        const at = nodeAt(operation.id);
        const current = nodes[at];
        if (current === undefined) fail(index, `There is no node "${operation.id}" to update`);
        else nodes[at] = changeNode(current, operation.changes);
        break;
      }
      case 'removeNode': {
        const removed = nodes[nodeAt(operation.id)];
        if (removed === undefined) {
          fail(index, `There is no node "${operation.id}" to remove`);
          break;
        }
        nodes = nodes
          // Text fixed to it goes with it, as when it is deleted on the canvas.
          .filter((other) => other.id !== removed.id && other.attachedTo !== removed.id)
          .map((other) =>
            other.parentId === removed.id
              ? withChanges(other, { parentId: removed.parentId ?? null })
              : other,
          );
        const kept = new Set(nodes.map(({ id }) => id));
        edges = edges.filter(({ source, target }) => kept.has(source) && kept.has(target));
        break;
      }
      case 'addEdge':
        if (edgeAt(operation.edge.id) !== -1) {
          fail(index, `Edge "${operation.edge.id}" already exists; use updateEdge to change it`);
        } else edges.push(operation.edge);
        break;
      case 'updateEdge': {
        const at = edgeAt(operation.id);
        const current = edges[at];
        if (current === undefined) fail(index, `There is no edge "${operation.id}" to update`);
        else edges[at] = withChanges<ArchEdge>(current, operation.changes);
        break;
      }
      case 'removeEdge':
        if (edgeAt(operation.id) === -1)
          fail(index, `There is no edge "${operation.id}" to remove`);
        else edges = edges.filter(({ id }) => id !== operation.id);
        break;
      case 'updateDiagram':
        diagram = withChanges(diagram, operation.changes);
        break;
    }
  });

  if (issues.length > 0) return { success: false, issues };

  const parsed = parseArchitectureGraph({ ...diagram, nodes, edges });
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.issues.map(({ message }) => ({ message })),
    };
  }
  return {
    success: true,
    graph: parsed.graph,
    changes: diffGraphs(graph, parsed.graph),
    warnings: parsed.warnings,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return (
    keysA.length === keysB.length &&
    keysA.every(
      (key) =>
        Object.hasOwn(b, key) &&
        sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

function changedIds<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
): ChangedIds {
  const previous = new Map(before.map((item) => [item.id, item]));
  const next = new Set(after.map(({ id }) => id));
  return {
    added: after.filter(({ id }) => !previous.has(id)).map(({ id }) => id),
    updated: after
      .filter((item) => {
        const old = previous.get(item.id);
        return old !== undefined && !sameValue(old, item);
      })
      .map(({ id }) => id),
    removed: before.filter(({ id }) => !next.has(id)).map(({ id }) => id),
  };
}

/** What changed between two versions of a graph, by node and edge id. */
export function diffGraphs(before: ArchitectureGraph, after: ArchitectureGraph): GraphChanges {
  return {
    diagram:
      before.title !== after.title ||
      before.description !== after.description ||
      before.provider !== after.provider,
    nodes: changedIds(before.nodes, after.nodes),
    edges: changedIds(before.edges, after.edges),
  };
}

/** Whether `changes` adds, changes or removes anything at all. */
export function hasChanges(changes: GraphChanges): boolean {
  return (
    changes.diagram ||
    [changes.nodes, changes.edges].some(
      ({ added, updated, removed }) => added.length + updated.length + removed.length > 0,
    )
  );
}
