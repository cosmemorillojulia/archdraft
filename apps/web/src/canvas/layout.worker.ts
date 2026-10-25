// Must stay the first import: it prepares the worker scope for elkjs.
import './elk-in-worker.ts';
import { computeLayout } from '@archdraft/layout';
import type { LayoutRequest, LayoutResponse } from './layout-client.ts';

/**
 * The part of the dedicated worker scope this file uses. The app compiles
 * against the DOM library, where `self` is a Window; the WebWorker library
 * cannot be loaded alongside it, so the scope is narrowed here, at the edge.
 */
interface LayoutWorkerScope {
  onmessage: ((event: MessageEvent<LayoutRequest>) => void) | null;
  postMessage: (message: LayoutResponse) => void;
}

const scope = self as unknown as LayoutWorkerScope;

/**
 * Runs ELK off the main thread, so that laying out a large diagram never
 * blocks the interface. One request in, one response out, matched by id.
 */
scope.onmessage = (event) => {
  const { id, graph, direction, pinned } = event.data;
  computeLayout(graph, pinned ? { direction, pinned } : { direction })
    .then((layout) => scope.postMessage({ id, layout }))
    .catch((error: unknown) => scope.postMessage({ id, error: String(error) }));
};
