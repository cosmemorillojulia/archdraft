import { getNodeDefinition } from './catalog.ts';
import { type CloudProvider, isContainerKind } from './kinds.ts';
import type { ArchEdge, ArchitectureGraph, ArchNode } from './schema.ts';

/**
 * Read-only lookup structures built once per graph so that validation, lint
 * rules, layout and exporters do not rescan arrays. Building is O(n + e).
 *
 * The index tolerates invalid graphs (duplicate ids, dangling references):
 * the first occurrence of an id wins and dangling references are skipped.
 * Detecting those problems is the job of `validateGraph`.
 */
export interface GraphIndex {
  readonly graph: ArchitectureGraph;
  readonly nodesById: ReadonlyMap<string, ArchNode>;
  readonly edgesById: ReadonlyMap<string, ArchEdge>;
  /** Direct children per container id. */
  readonly childrenOf: ReadonlyMap<string, readonly ArchNode[]>;
  /** Outgoing edges per node id. */
  readonly outgoing: ReadonlyMap<string, readonly ArchEdge[]>;
  /** Incoming edges per node id. */
  readonly incoming: ReadonlyMap<string, readonly ArchEdge[]>;
  /** Nodes without a parent, or whose parent does not exist. */
  readonly roots: readonly ArchNode[];
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function indexGraph(graph: ArchitectureGraph): GraphIndex {
  const nodesById = new Map<string, ArchNode>();
  for (const node of graph.nodes) {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  }

  const edgesById = new Map<string, ArchEdge>();
  const outgoing = new Map<string, ArchEdge[]>();
  const incoming = new Map<string, ArchEdge[]>();
  for (const edge of graph.edges) {
    if (edgesById.has(edge.id)) continue;
    edgesById.set(edge.id, edge);
    if (nodesById.has(edge.source) && nodesById.has(edge.target)) {
      push(outgoing, edge.source, edge);
      push(incoming, edge.target, edge);
    }
  }

  const childrenOf = new Map<string, ArchNode[]>();
  const roots: ArchNode[] = [];
  for (const node of nodesById.values()) {
    if (node.parentId !== undefined && nodesById.has(node.parentId)) {
      push(childrenOf, node.parentId, node);
    } else {
      roots.push(node);
    }
  }

  return { graph, nodesById, edgesById, childrenOf, outgoing, incoming, roots };
}

/**
 * Parents from the closest to the outermost. Stops silently on a cycle or a
 * dangling `parentId`, so it is safe to call on unvalidated graphs.
 */
export function getAncestors(index: GraphIndex, nodeId: string): ArchNode[] {
  const ancestors: ArchNode[] = [];
  const seen = new Set<string>([nodeId]);
  let current = index.nodesById.get(nodeId);
  while (current?.parentId !== undefined && !seen.has(current.parentId)) {
    const parent = index.nodesById.get(current.parentId);
    if (!parent) break;
    ancestors.push(parent);
    seen.add(parent.id);
    current = parent;
  }
  return ancestors;
}

/** All nodes nested at any depth inside `nodeId`, breadth first. Cycle safe. */
export function getDescendants(index: GraphIndex, nodeId: string): ArchNode[] {
  const result: ArchNode[] = [];
  const seen = new Set<string>([nodeId]);
  const queue = [...(index.childrenOf.get(nodeId) ?? [])];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (seen.has(next.id)) continue;
    seen.add(next.id);
    result.push(next);
    queue.push(...(index.childrenOf.get(next.id) ?? []));
  }
  return result;
}

export function isContainer(node: ArchNode): boolean {
  return isContainerKind(node.kind);
}

/** The provider a node is rendered and exported for. */
export function resolveProvider(node: ArchNode, graph: ArchitectureGraph): CloudProvider {
  return node.provider ?? graph.provider;
}

/**
 * Display name of the concrete product behind a node: explicit `service`,
 * then the catalog default for the resolved provider, then the kind label.
 */
export function resolveServiceName(node: ArchNode, graph: ArchitectureGraph): string {
  if (node.service !== undefined) return node.service;
  const definition = getNodeDefinition(node.kind);
  const provider = resolveProvider(node, graph);
  if (provider === 'generic') return definition.label;
  return definition.services[provider] ?? definition.label;
}
