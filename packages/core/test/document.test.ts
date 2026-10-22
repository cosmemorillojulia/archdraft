import { describe, expect, it } from 'vitest';
import {
  createEmptyLayout,
  DiagramDocumentSchema,
  DiagramLayoutSchema,
  layoutEntry,
  LIMITS,
} from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

describe('DiagramLayoutSchema', () => {
  it('accepts positions and sizes keyed by node id', () => {
    const layout = {
      positions: { api: { x: 10, y: -5.5 } },
      sizes: { api: { width: 160, height: 60 } },
    };
    expect(DiagramLayoutSchema.parse(layout)).toEqual(layout);
  });

  it('accepts the empty layout', () => {
    expect(DiagramLayoutSchema.safeParse(createEmptyLayout()).success).toBe(true);
  });

  it.each([
    ['a non finite coordinate', { positions: { a: { x: Infinity, y: 0 } }, sizes: {} }],
    ['a zero width', { positions: {}, sizes: { a: { width: 0, height: 10 } } }],
    ['a negative height', { positions: {}, sizes: { a: { width: 10, height: -1 } } }],
    ['a key that is not an id', { positions: { __proto__x: { x: 0, y: 0 } }, sizes: {} }],
    ['an unknown point field', { positions: { a: { x: 0, y: 0, z: 1 } }, sizes: {} }],
    ['a missing section', { positions: {} }],
  ])('rejects %s', (_name, layout) => {
    expect(DiagramLayoutSchema.safeParse(layout).success).toBe(false);
  });

  it('rejects more entries than the node limit', () => {
    const positions = Object.fromEntries(
      Array.from({ length: LIMITS.maxNodes + 1 }, (_, i) => [`n${i}`, { x: 0, y: 0 }]),
    );
    expect(DiagramLayoutSchema.safeParse({ positions, sizes: {} }).success).toBe(false);
  });
});

describe('DiagramDocumentSchema', () => {
  it('combines a valid graph and a layout', () => {
    const document = { graph: threeTierGraph(), layout: createEmptyLayout() };
    expect(DiagramDocumentSchema.parse(document)).toEqual(document);
  });

  it('rejects an invalid graph', () => {
    const document = {
      graph: { ...threeTierGraph(), schemaVersion: 2 },
      layout: createEmptyLayout(),
    };
    expect(DiagramDocumentSchema.safeParse(document).success).toBe(false);
  });
});

describe('layoutEntry', () => {
  it('returns own entries', () => {
    expect(layoutEntry({ api: { x: 1, y: 2 } }, 'api')).toEqual({ x: 1, y: 2 });
  });

  it.each(['constructor', 'toString', 'hasOwnProperty', 'missing'])(
    'returns undefined for %s when it is not an own entry',
    (id) => {
      expect(layoutEntry<unknown>({}, id)).toBeUndefined();
    },
  );
});
