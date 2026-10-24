import type { ArchitectureGraph, DiagramLayout } from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';

export interface LayoutRequest {
  id: number;
  graph: ArchitectureGraph;
  direction: LayoutDirection;
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
 */
export function layoutDiagram(
  graph: ArchitectureGraph,
  direction: LayoutDirection,
): Promise<DiagramLayout> {
  if (typeof Worker === 'undefined') {
    return import('@archdraft/layout').then(({ computeLayout }) =>
      computeLayout(graph, { direction }),
    );
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (response) => {
      if ('layout' in response) resolve(response.layout);
      else reject(new Error(response.error));
    });
    layoutWorker().postMessage({ id, graph, direction } satisfies LayoutRequest);
  });
}
