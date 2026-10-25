import type { ArchitectureGraph, DiagramLayout } from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';

export interface LayoutRequest {
  id: number;
  graph: ArchitectureGraph;
  direction: LayoutDirection;
  /** A layout to keep: only the nodes it lacks are placed. */
  pinned?: DiagramLayout;
}

export type LayoutResponse = { id: number; layout: DiagramLayout } | { id: number; error: string };

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, (response: LayoutResponse) => void>();

function layoutWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<LayoutResponse>) => {
      pending.get(event.data.id)?.(event.data);
      pending.delete(event.data.id);
    };
  }
  return worker;
}

/**
 * Lays out a diagram with ELK in a Web Worker, created on first use so that
 * ELK is only downloaded when a diagram is drawn. Where workers are not
 * available (tests, very old browsers) it runs on the main thread instead.
 * With `pinned`, nodes keep their place there and only the others are placed.
 */
export function layoutDiagram(
  graph: ArchitectureGraph,
  direction: LayoutDirection,
  pinned?: DiagramLayout,
): Promise<DiagramLayout> {
  const options = pinned ? { direction, pinned } : { direction };
  if (typeof Worker === 'undefined') {
    return import('@archdraft/layout').then(({ computeLayout }) => computeLayout(graph, options));
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (response) => {
      if ('layout' in response) resolve(response.layout);
      else reject(new Error(response.error));
    });
    layoutWorker().postMessage({ id, graph, ...options } satisfies LayoutRequest);
  });
}
