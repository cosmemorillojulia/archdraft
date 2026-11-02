import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  type DiagramDocument,
  type GraphChanges,
  layoutEntry,
  type NodeAttributes,
  type NodeKind,
  type Proposal,
} from '@archdraft/shared';
import type { ChangeMark, ChangeMarks } from './assistant-store.ts';

/**
 * What a change of the assistant does, in the forms the editor shows it: marks
 * on the canvas, the diagram as it would be with what goes still in it, and a
 * list of changes in words. Pure, so the panel and the canvas agree.
 */

/** Share of the nodes a change may add, remove or regroup and still keep the rest in place. */
export const TIDY_SHARE = 0.4;

/** An edit that touches more than this many nodes and edges is shown before it is applied. */
export const REVIEW_TOUCHES = 8;

export function marksOf(changes: GraphChanges): ChangeMarks {
  const marks = ({ added, updated, removed }: GraphChanges['nodes']) =>
    new Map<string, ChangeMark>([
      ...added.map((id) => [id, 'added'] as const),
      ...updated.map((id) => [id, 'updated'] as const),
      ...removed.map((id) => [id, 'removed'] as const),
    ]);
  return { nodes: marks(changes.nodes), edges: marks(changes.edges) };
}

/** How many nodes and edges a change touches. */
export function touchCount(changes: GraphChanges): number {
  return [changes.nodes, changes.edges].reduce(
    (sum, { added, updated, removed }) => sum + added.length + updated.length + removed.length,
    0,
  );
}

/**
 * Whether an edit asked in words is shown first instead of applied straight
 * away: one that removes a part of the diagram, or changes much of it, may not
 * be what the person meant.
 */
export function needsReview(proposal: Proposal): boolean {
  return proposal.changes.nodes.removed.length > 0 || touchCount(proposal.changes) > REVIEW_TOUCHES;
}

/**
 * Whether the diagram after a change is better laid out again as a whole: when
 * much of it is new, gone or in another group, what stays in place no longer
 * gives the rest a good shape.
 */
export function shouldTidy(
  before: ArchitectureGraph,
  after: ArchitectureGraph,
  changes: GraphChanges,
): boolean {
  if (before.nodes.length === 0) return true;
  const parentBefore = new Map(before.nodes.map((node) => [node.id, node.parentId]));
  const regrouped = after.nodes.filter(
    (node) => parentBefore.has(node.id) && parentBefore.get(node.id) !== node.parentId,
  ).length;
  const moved = changes.nodes.added.length + changes.nodes.removed.length + regrouped;
  return moved / Math.max(before.nodes.length, after.nodes.length) > TIDY_SHARE;
}

/**
 * The diagram `after` a change, with the nodes and edges it removes from
 * `before` still drawn where they were, so the preview shows them going. When
 * the whole diagram is laid out again, where they were means nothing there,
 * and they are left out.
 */
export function previewDocument(
  before: DiagramDocument,
  after: DiagramDocument,
  changes: GraphChanges,
  tidy: boolean,
): DiagramDocument {
  if (tidy) return after;
  const removedNodes = new Set(changes.nodes.removed);
  const removedEdges = new Set(changes.edges.removed);
  const ghosts = before.graph.nodes.filter((node) => removedNodes.has(node.id));
  const present = new Set([...after.graph.nodes, ...ghosts].map((node) => node.id));
  const ghostEdges = before.graph.edges.filter(
    (edge) => removedEdges.has(edge.id) && present.has(edge.source) && present.has(edge.target),
  );
  const positions = { ...after.layout.positions };
  const sizes = { ...after.layout.sizes };
  for (const node of ghosts) {
    const position = layoutEntry(before.layout.positions, node.id);
    const size = layoutEntry(before.layout.sizes, node.id);
    if (position) positions[node.id] = position;
    if (size) sizes[node.id] = size;
  }
  return {
    // What goes comes first, so what takes its place is drawn over it.
    graph: {
      ...after.graph,
      nodes: [...ghosts, ...after.graph.nodes],
      edges: [...ghostEdges, ...after.graph.edges],
    },
    layout: { ...after.layout, positions, sizes },
  };
}

/** What changed in a node or an edge that stays, as facts the panel words. */
export type ChangeDetail =
  | { readonly type: 'renamed'; readonly from: string; readonly to: string }
  | { readonly type: 'kind'; readonly from: NodeKind; readonly to: NodeKind }
  | { readonly type: 'moved'; readonly into: string | null }
  | { readonly type: 'attributes'; readonly names: readonly (keyof NodeAttributes)[] }
  | { readonly type: 'reconnected' }
  | { readonly type: 'details' };

export type ChangeItem =
  | {
      readonly type: 'node';
      readonly id: string;
      readonly mark: ChangeMark;
      readonly node: ArchNode;
      readonly details: readonly ChangeDetail[];
    }
  | {
      readonly type: 'edge';
      readonly id: string;
      readonly mark: ChangeMark;
      readonly edge: ArchEdge;
      /** The nodes at its ends, as they are after the change or, if they go, before. */
      readonly source: ArchNode | undefined;
      readonly target: ArchNode | undefined;
      readonly details: readonly ChangeDetail[];
    }
  | { readonly type: 'diagram'; readonly mark: 'updated' };

const MARK_ORDER: readonly ChangeMark[] = ['added', 'updated', 'removed'];

const ATTRIBUTE_NAMES = [
  'replicas',
  'multiAz',
  'autoscaling',
  'publiclyAccessible',
  'encryptedAtRest',
  'managed',
] as const satisfies readonly (keyof NodeAttributes)[];

function nodeDetails(
  old: ArchNode,
  now: ArchNode,
  label: (id: string) => string | undefined,
): ChangeDetail[] {
  const details: ChangeDetail[] = [];
  if (old.label !== now.label) details.push({ type: 'renamed', from: old.label, to: now.label });
  if (old.kind !== now.kind) details.push({ type: 'kind', from: old.kind, to: now.kind });
  if (old.parentId !== now.parentId) {
    details.push({
      type: 'moved',
      into: now.parentId === undefined ? null : (label(now.parentId) ?? now.parentId),
    });
  }
  const names = ATTRIBUTE_NAMES.filter((name) => old.attributes?.[name] !== now.attributes?.[name]);
  if (names.length > 0) details.push({ type: 'attributes', names });
  const other = (node: ArchNode) =>
    JSON.stringify([node.description, node.provider, node.service, node.tags, node.attachedTo]);
  if (other(old) !== other(now)) details.push({ type: 'details' });
  return details;
}

function edgeDetails(old: ArchEdge, now: ArchEdge): ChangeDetail[] {
  const details: ChangeDetail[] = [];
  if (old.source !== now.source || old.target !== now.target) details.push({ type: 'reconnected' });
  if (old.label !== now.label || old.protocol !== now.protocol || old.mode !== now.mode) {
    details.push({ type: 'details' });
  }
  return details;
}

/**
 * The changes from `before` to `after`, one per node or edge, in the order a
 * person reads them: what is new, what changes and what goes, components
 * before their connections.
 */
export function changeItems(
  before: ArchitectureGraph,
  after: ArchitectureGraph,
  changes: GraphChanges,
): ChangeItem[] {
  const nodesBefore = new Map(before.nodes.map((node) => [node.id, node]));
  const nodesAfter = new Map(after.nodes.map((node) => [node.id, node]));
  const edgesBefore = new Map(before.edges.map((edge) => [edge.id, edge]));
  const edgesAfter = new Map(after.edges.map((edge) => [edge.id, edge]));
  const nodeOf = (id: string) => nodesAfter.get(id) ?? nodesBefore.get(id);
  const labelAfter = (id: string) => nodesAfter.get(id)?.label;

  const items: ChangeItem[] = [];
  if (changes.diagram) items.push({ type: 'diagram', mark: 'updated' });
  for (const mark of MARK_ORDER) {
    for (const id of changes.nodes[mark]) {
      const old = nodesBefore.get(id);
      const now = nodesAfter.get(id);
      const node = now ?? old;
      if (!node) continue;
      const details = mark === 'updated' && old && now ? nodeDetails(old, now, labelAfter) : [];
      items.push({ type: 'node', id, mark, node, details });
    }
  }
  for (const mark of MARK_ORDER) {
    for (const id of changes.edges[mark]) {
      const old = edgesBefore.get(id);
      const now = edgesAfter.get(id);
      const edge = now ?? old;
      if (!edge) continue;
      const details = mark === 'updated' && old && now ? edgeDetails(old, now) : [];
      items.push({
        type: 'edge',
        id,
        mark,
        edge,
        source: nodeOf(edge.source),
        target: nodeOf(edge.target),
        details,
      });
    }
  }
  return items;
}
