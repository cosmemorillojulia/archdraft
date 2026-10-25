import type { ArchEdge, LintSeverity } from '@archdraft/core';
import { createContext, useContext } from 'react';
import type { Selection } from '../editor/operations.ts';

/**
 * What the nodes and edges of the canvas need to know beyond their own data.
 * It lives in a context, not in the data of each node, so that hovering or
 * selecting does not rebuild the nodes.
 */
export interface CanvasState {
  /** Component under the pointer, or else the selected one: it and its connections stand out. */
  focusId: string | null;
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
  /** Whether everything else fades: only while the pointer rests on a component. */
  dimOthers: boolean;
  selection: Selection | null;
  /** Container that the node being dragged would move into. */
  dropTargetId: string | null;
  /** True while the diagram builds in; elements added later appear without delay. */
  building: boolean;
  /** Ids of the arrowhead markers, shared by every edge of the canvas. */
  markers: { idle: string; active: string };
  /** While the design review is open: the most severe finding of each component. */
  issues: ReadonlyMap<string, LintSeverity>;
  /** The finding chosen in the review: its components are outlined in its colour. */
  finding: { nodes: ReadonlySet<string>; severity: LintSeverity } | null;
}

export const CanvasContext = createContext<CanvasState>({
  focusId: null,
  nodes: new Set(),
  edges: new Set(),
  dimOthers: false,
  selection: null,
  dropTargetId: null,
  building: false,
  markers: { idle: '', active: '' },
  issues: new Map(),
  finding: null,
});

export function useCanvas(): CanvasState {
  return useContext(CanvasContext);
}

export function isSelected(selection: Selection | null, type: Selection['type'], id: string) {
  return selection?.type === type && selection.id === id;
}

/** Components and edges related to `focusId`: the component itself, its edges and their other ends. */
export function relatedTo(
  focusId: string | null,
  edges: readonly ArchEdge[],
): Pick<CanvasState, 'nodes' | 'edges'> {
  if (focusId === null) return { nodes: new Set(), edges: new Set() };
  const nodes = new Set([focusId]);
  const edgeIds = new Set<string>();
  for (const { id, source, target } of edges) {
    if (source !== focusId && target !== focusId) continue;
    edgeIds.add(id);
    nodes.add(source);
    nodes.add(target);
  }
  return { nodes, edges: edgeIds };
}
