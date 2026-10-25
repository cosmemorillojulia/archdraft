import type { NodeKind } from '@archdraft/core';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { KIND_ICONS } from '../icons.ts';

const cache = new Map<NodeKind, string>();

/**
 * Inner markup of the Lucide icon of a kind (paths in a 24 × 24 box), the
 * same icon the canvas shows. It is rendered once into a detached element.
 */
export function iconMarkup(kind: NodeKind): string {
  const known = cache.get(kind);
  if (known !== undefined) return known;
  const Icon = KIND_ICONS[kind];
  const host = globalThis.document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(<Icon size={24} />));
  const markup = host.querySelector('svg')?.innerHTML ?? '';
  root.unmount();
  cache.set(kind, markup);
  return markup;
}
