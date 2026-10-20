import { getNodeDefinition } from '../catalog.ts';
import { type GraphIndex, resolveEdgeMode } from '../graph.ts';
import type { ArchEdge, ArchNode } from '../schema.ts';

/** Nodes and the edges that join them: a path, or the members of a cycle. */
export interface SyncPath {
  readonly nodes: readonly ArchNode[];
  readonly edges: readonly ArchEdge[];
}

function syncOutgoing(index: GraphIndex, nodeId: string): ArchEdge[] {
  return (index.outgoing.get(nodeId) ?? []).filter((edge) => resolveEdgeMode(edge) === 'sync');
}

/**
 * For every actor, the first synchronous path found with more than `maxHops`
 * edges, cut at `maxHops + 1` edges. Paths are simple (no repeated node), so
 * cycles cannot inflate them; cycles have their own rule.
 *
 * The depth-first search stops at `maxHops + 1` edges, so its cost is bounded
 * by the number of simple paths of that length, small for the schema limits.
 */
export function findLongSyncPaths(index: GraphIndex, maxHops: number): SyncPath[] {
  const paths: SyncPath[] = [];
  for (const node of index.nodesById.values()) {
    if (getNodeDefinition(node.kind).category !== 'actor') continue;
    const path = searchLongerThan(index, node, maxHops);
    if (path) paths.push(path);
  }
  return paths;
}

function searchLongerThan(index: GraphIndex, start: ArchNode, maxHops: number): SyncPath | null {
  const nodes = [start];
  const edges: ArchEdge[] = [];
  const onPath = new Set([start.id]);

  const visit = (nodeId: string): boolean => {
    if (edges.length > maxHops) return true;
    for (const edge of syncOutgoing(index, nodeId)) {
      const target = index.nodesById.get(edge.target);
      if (target === undefined || onPath.has(target.id)) continue;
      nodes.push(target);
      edges.push(edge);
      onPath.add(target.id);
      if (visit(target.id)) return true;
      onPath.delete(target.id);
      nodes.pop();
      edges.pop();
    }
    return false;
  };

  return visit(start.id) ? { nodes, edges } : null;
}

/**
 * Groups of components that reach each other through synchronous edges only:
 * the strongly connected components of the synchronous subgraph with more than
 * one node (self loops are rejected by validation). One group per cycle
 * cluster, so overlapping loops are reported once. Tarjan's algorithm, O(n + e).
 */
export function findSyncCycles(index: GraphIndex): SyncPath[] {
  const order = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const groups: Set<string>[] = [];

  /** Visits `nodeId` and returns its low link. */
  const connect = (nodeId: string): number => {
    const position = order.size;
    order.set(nodeId, position);
    stack.push(nodeId);
    onStack.add(nodeId);

    let lowLink = position;
    for (const { target } of syncOutgoing(index, nodeId)) {
      const visited = order.get(target);
      if (visited === undefined) lowLink = Math.min(lowLink, connect(target));
      else if (onStack.has(target)) lowLink = Math.min(lowLink, visited);
    }
    if (lowLink !== position) return lowLink;

    const group = new Set<string>();
    for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
      onStack.delete(member);
      group.add(member);
      if (member === nodeId) break;
    }
    if (group.size > 1) groups.push(group);
    return lowLink;
  };

  for (const nodeId of index.nodesById.keys()) {
    if (!order.has(nodeId)) connect(nodeId);
  }

  return groups.map((group) => ({
    nodes: [...index.nodesById.values()].filter((node) => group.has(node.id)),
    edges: index.graph.edges.filter(
      (edge) =>
        group.has(edge.source) && group.has(edge.target) && resolveEdgeMode(edge) === 'sync',
    ),
  }));
}
