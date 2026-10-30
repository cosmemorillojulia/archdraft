import { describe, expect, it } from 'vitest';
import {
  createEmptyLayout,
  DiagramDocumentSchema,
  DiagramLayoutSchema,
  layoutEntry,
  LIMITS,
  ownEdgeStyle,
  resolveEdgeStyle,
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

describe('the style of connections in the layout', () => {
  const base = createEmptyLayout();

  it('accepts a style for the diagram and styles for single connections', () => {
    const layout = { ...base, edgeStyle: 'square', edgeStyles: { 'api-db': 'curved' } };
    expect(DiagramLayoutSchema.parse(layout)).toEqual(layout);
  });

  it.each([
    ['an unknown style for the diagram', { ...base, edgeStyle: 'zigzag' }],
    ['an unknown style for a connection', { ...base, edgeStyles: { a: 'zigzag' } }],
    ['a key that is not an id', { ...base, edgeStyles: { __proto__x: 'square' } }],
  ])('rejects %s', (_name, layout) => {
    expect(DiagramLayoutSchema.safeParse(layout).success).toBe(false);
  });

  it('rejects more styles than the edge limit', () => {
    const edgeStyles = Object.fromEntries(
      Array.from({ length: LIMITS.maxEdges + 1 }, (_, i) => [`e${i}`, 'square']),
    );
    expect(DiagramLayoutSchema.safeParse({ ...base, edgeStyles }).success).toBe(false);
  });

  it('tells the style an edge has of its own, which is none unless it was given one', () => {
    const layout = { ...base, edgeStyle: 'square', edgeStyles: { 'api-db': 'curved' } } as const;
    expect(ownEdgeStyle(layout, 'api-db')).toBe('curved');
    expect(ownEdgeStyle(layout, 'other')).toBeUndefined();
    expect(ownEdgeStyle(base, 'api-db')).toBeUndefined();
  });

  describe('resolveEdgeStyle', () => {
    it('is curved when nothing says otherwise', () => {
      expect(resolveEdgeStyle(base, 'api-db')).toBe('curved');
    });

    it('follows the style of the diagram', () => {
      expect(resolveEdgeStyle({ ...base, edgeStyle: 'square' }, 'api-db')).toBe('square');
    });

    it('prefers the style of the connection to the one of the diagram', () => {
      const layout = { ...base, edgeStyle: 'square', edgeStyles: { 'api-db': 'curved' } } as const;
      expect(resolveEdgeStyle(layout, 'api-db')).toBe('curved');
      expect(resolveEdgeStyle(layout, 'other')).toBe('square');
    });

    it.each(['constructor', 'toString', '__proto__'])(
      'ignores what an id such as %s inherits from Object.prototype',
      (id) => {
        expect(resolveEdgeStyle({ ...base, edgeStyles: {} }, id)).toBe('curved');
      },
    );
  });
});
