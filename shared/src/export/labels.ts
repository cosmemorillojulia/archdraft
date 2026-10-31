import { getNodeDefinition } from '../catalog.ts';
import { resolveServiceName } from '../graph.ts';
import { isShapeKind } from '../kinds.ts';
import type { ArchEdge, ArchitectureGraph, ArchNode } from '../schema.ts';

/**
 * Text rules shared by every exporter, so that a diagram reads the same in
 * Mermaid, draw.io and the editor.
 */

/**
 * The product behind a node, when it is worth a second line: it must say
 * something the label and the generic kind name do not. A generic `service`
 * node does not repeat "Service" under its name.
 */
export function nodeSubtitle(node: ArchNode, graph: ArchitectureGraph): string | undefined {
  // A shape is only its text.
  if (isShapeKind(node.kind)) return undefined;
  const service = resolveServiceName(node, graph);
  return service === getNodeDefinition(node.kind).label || service === node.label
    ? undefined
    : service;
}

/** `"Reads · grpc"`, only one of both when the other is missing, or `''`. */
export function edgeText(edge: ArchEdge): string {
  return [edge.label, edge.protocol].filter((part) => part !== undefined).join(' · ');
}
