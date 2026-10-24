import type { ArchEdge } from '@archdraft/core';
import { createContext, useContext } from 'react';

/** What the pointer, or a tap, has brought into focus: a component and everything it touches. */
export interface Highlight {
  focusId: string | null;
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
  /** Ids of the arrowhead markers, shared by every edge of the canvas. */
  markers: { idle: string; active: string };
}

export const HighlightContext = createContext<Highlight>({
  focusId: null,
  nodes: new Set(),
  edges: new Set(),
  markers: { idle: '', active: '' },
});

export function useHighlight(): Highlight {
  return useContext(HighlightContext);
}

/** Components and edges related to `focusId`: the component itself, its edges and their other ends. */
export function relatedTo(
  focusId: string | null,
  edges: readonly ArchEdge[],
): Pick<Highlight, 'nodes' | 'edges'> {
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
