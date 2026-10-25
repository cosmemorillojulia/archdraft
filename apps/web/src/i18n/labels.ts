import {
  type ArchitectureGraph,
  type ArchNode,
  getNodeDefinition,
  type NodeKind,
  resolveProvider,
} from '@archdraft/core';
import type { KindText } from './en.ts';

/**
 * Product shown for a node, as `resolveServiceName` in @archdraft/core
 * resolves it: the one set on the node, then the usual one of its provider.
 * When there is neither, core falls back to the English name of the kind;
 * this one uses the name in the language of the interface.
 */
export function productName(
  node: ArchNode,
  graph: ArchitectureGraph,
  kinds: Readonly<Record<NodeKind, KindText>>,
): string {
  if (node.service !== undefined) return node.service;
  const provider = resolveProvider(node, graph);
  const product =
    provider === 'generic' ? undefined : getNodeDefinition(node.kind).services[provider];
  return product ?? kinds[node.kind].label;
}
