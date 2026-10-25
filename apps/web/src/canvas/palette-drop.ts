import { NODE_KINDS, type NodeKind } from '@archdraft/core';

/** Data type that carries the kind of a palette tile dragged onto the canvas. */
export const KIND_MIME = 'application/x-archdraft-kind';

const KINDS: ReadonlySet<string> = new Set(NODE_KINDS);

/** Whether dropped data names a node kind; anything else dropped on the canvas is ignored. */
export function isNodeKind(value: string): value is NodeKind {
  return KINDS.has(value);
}
