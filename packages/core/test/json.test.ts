import { describe, expect, it } from 'vitest';
import {
  type ArchitectureGraph,
  type DiagramDocument,
  documentToJson,
  importDocument,
  importJson,
  toJson,
} from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

describe('toJson', () => {
  it('pretty prints the graph with two-space indentation', () => {
    const graph: ArchitectureGraph = {
      schemaVersion: 1,
      title: 'Tiny',
      provider: 'generic',
      nodes: [{ id: 'a', kind: 'service', label: 'A' }],
      edges: [],
    };
    expect(toJson(graph)).toMatchInlineSnapshot(`
      "{
        "schemaVersion": 1,
        "title": "Tiny",
        "provider": "generic",
        "nodes": [
          {
            "id": "a",
            "kind": "service",
            "label": "A"
          }
        ],
        "edges": []
      }"
    `);
  });

  it('writes keys in schema order whatever the input order', () => {
    const shuffled = {
      edges: [{ mode: 'sync', protocol: 'https', target: 'b', source: 'a', id: 'e' }],
      nodes: [
        { attributes: { managed: true, replicas: 2 }, label: 'A', kind: 'service', id: 'a' },
        { tags: ['x'], parentId: 'r', label: 'B', kind: 'service', id: 'b' },
        { label: 'R', kind: 'boundary', id: 'r' },
      ],
      provider: 'aws',
      description: 'd',
      title: 'Shuffled',
      schemaVersion: 1,
    } satisfies ArchitectureGraph;

    const parsed: unknown = JSON.parse(toJson(shuffled));
    const keys = (value: unknown): string[] => Object.keys(value as object);
    const { nodes, edges } = parsed as { nodes: unknown[]; edges: unknown[] };

    expect(keys(parsed)).toEqual([
      'schemaVersion',
      'title',
      'description',
      'provider',
      'nodes',
      'edges',
    ]);
    expect(keys(nodes[0])).toEqual(['id', 'kind', 'label', 'attributes']);
    expect(keys((nodes[0] as { attributes: unknown }).attributes)).toEqual(['replicas', 'managed']);
    expect(keys(nodes[1])).toEqual(['id', 'kind', 'label', 'parentId', 'tags']);
    expect(keys(edges[0])).toEqual(['id', 'source', 'target', 'protocol', 'mode']);
  });

  it('omits undefined optional fields and keys outside the schema', () => {
    const graph = {
      ...threeTierGraph(),
      description: undefined,
      extra: 'ignored',
      nodes: [{ id: 'a', kind: 'service', label: 'A', service: undefined }],
      edges: [],
    } as ArchitectureGraph;
    const text = toJson(graph);
    expect(text).not.toContain('"description":');
    expect(text).not.toContain('"extra":');
    expect(text).not.toContain('"service":');
  });
});

describe('importJson', () => {
  it('round-trips the fixture without loss', () => {
    const graph = threeTierGraph();
    const result = importJson(toJson(graph));
    expect(result).toEqual({ success: true, graph, warnings: [] });
  });

  it('round-trips special characters in labels', () => {
    const graph: ArchitectureGraph = {
      ...threeTierGraph(),
      title: 'Quotes " backslash \\ line\nbreak',
      nodes: [{ id: 'a', kind: 'service', label: '<b>"x"</b> & ünïcødé 🚀' }],
      edges: [],
    };
    const result = importJson(toJson(graph));
    expect(result.success && result.graph).toEqual(graph);
  });

  it('returns structural warnings with the graph', () => {
    const graph: ArchitectureGraph = {
      ...threeTierGraph(),
      edges: [
        ...threeTierGraph().edges,
        { id: 'dup', source: 'customer', target: 'cdn', protocol: 'https' },
      ],
    };
    const result = importJson(toJson(graph));
    expect(result.success).toBe(true);
    expect(result.success && result.warnings.map((issue) => issue.code)).toEqual([
      'DUPLICATE_EDGE',
    ]);
  });

  it('reports text that is not JSON', () => {
    const result = importJson('{"schemaVersion": 1,');
    if (result.success) throw new Error('expected a failure');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ code: 'INVALID_JSON', severity: 'error' });
    expect(result.issues[0]?.message).toMatch(/^Not valid JSON: \S/);
  });

  it('reports an empty file as invalid JSON', () => {
    expect(importJson('')).toMatchObject({ success: false, issues: [{ code: 'INVALID_JSON' }] });
  });

  it('rejects files from a newer format version', () => {
    const text = JSON.stringify({ ...threeTierGraph(), schemaVersion: 2 });
    expect(importJson(text)).toMatchObject({
      success: false,
      issues: [{ code: 'UNSUPPORTED_SCHEMA_VERSION' }],
    });
  });

  it('delegates shape problems to the schema', () => {
    for (const text of ['null', '[]', '"graph"', '{}', '{"schemaVersion":"1"}']) {
      const result = importJson(text);
      expect(result.success).toBe(false);
      expect(!result.success && result.issues.every((issue) => issue.code === 'SCHEMA')).toBe(true);
    }
  });

  it('reports structural errors of a well-formed file', () => {
    const graph = {
      ...threeTierGraph(),
      edges: [{ id: 'e', source: 'customer', target: 'ghost' }],
    };
    expect(importJson(JSON.stringify(graph))).toMatchObject({
      success: false,
      issues: [{ code: 'EDGE_UNKNOWN_TARGET' }],
    });
  });

  it('does not let a __proto__ key pollute prototypes', () => {
    const text = '{"schemaVersion":1,"__proto__":{"polluted":true}}';
    const result = importJson(text);
    expect(result.success).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('documentToJson and importDocument', () => {
  const graph: ArchitectureGraph = {
    schemaVersion: 1,
    title: 'Pair',
    provider: 'aws',
    nodes: [
      { id: 'api', kind: 'service', label: 'API' },
      { id: 'db', kind: 'relational-db', label: 'DB' },
    ],
    edges: [{ id: 'api-db', source: 'api', target: 'db', protocol: 'sql' }],
  };
  const document: DiagramDocument = {
    graph,
    layout: {
      // Entries out of node order, and one for a node that no longer exists.
      positions: { db: { x: 300, y: 0 }, api: { x: 0, y: 0 } },
      sizes: { db: { width: 180, height: 64 }, api: { width: 180, height: 64 } },
    },
  };

  it('writes the graph in schema order and the layout in node order', () => {
    const text = documentToJson(document);
    expect(Object.keys(JSON.parse(text) as object)).toEqual(['graph', 'layout']);
    expect(text.indexOf('"api": {')).toBeLessThan(text.indexOf('"db": {'));
    expect(text).toContain('\n  "graph"');
  });

  it('writes compact JSON on request', () => {
    expect(documentToJson(document, { indent: 0 })).not.toContain('\n');
  });

  it('round-trips a document', () => {
    const result = importDocument(documentToJson(document));
    expect(result).toEqual({ success: true, graph, layout: document.layout, warnings: [] });
  });

  it('round-trips the style of the connections', () => {
    const styled: DiagramDocument = {
      graph,
      layout: { ...document.layout, edgeStyle: 'square', edgeStyles: { 'api-db': 'curved' } },
    };
    const result = importDocument(documentToJson(styled));
    expect(result).toEqual({ success: true, graph, layout: styled.layout, warnings: [] });
  });

  it('writes no style for a diagram that chose none', () => {
    const { layout } = JSON.parse(documentToJson(document)) as { layout: object };
    expect(Object.keys(layout)).toEqual(['positions', 'sizes']);
  });

  it('keeps only the styles of connections in the graph', () => {
    const stray: DiagramDocument = {
      graph,
      layout: { ...document.layout, edgeStyles: { ghost: 'square' } },
    };
    expect(JSON.parse(documentToJson(stray)) as object).not.toHaveProperty('layout.edgeStyles');
    const text = JSON.stringify({
      graph,
      layout: { positions: {}, sizes: {}, edgeStyles: { 'api-db': 'square', ghost: 'square' } },
    });
    expect(importDocument(text)).toMatchObject({
      success: true,
      layout: { edgeStyles: { 'api-db': 'square' } },
    });
  });

  it('rejects an unknown style with its path', () => {
    const text = JSON.stringify({
      graph,
      layout: { positions: {}, sizes: {}, edgeStyle: 'zigzag' },
    });
    expect(importDocument(text)).toMatchObject({
      success: false,
      issues: [{ code: 'SCHEMA', path: ['layout', 'edgeStyle'] }],
    });
  });

  it('reads a bare graph without a layout', () => {
    expect(importDocument(toJson(graph))).toMatchObject({ success: true, graph, layout: null });
    expect(importDocument(JSON.stringify({ graph }))).toMatchObject({
      success: true,
      layout: null,
    });
  });

  it('keeps only the layout entries of nodes in the graph', () => {
    const text = JSON.stringify({
      graph,
      layout: { positions: { api: { x: 1, y: 2 }, ghost: { x: 0, y: 0 } }, sizes: {} },
    });
    expect(importDocument(text)).toMatchObject({
      success: true,
      layout: { positions: { api: { x: 1, y: 2 } }, sizes: {} },
    });
  });

  it('rejects a malformed layout with its path', () => {
    const text = JSON.stringify({ graph, layout: { positions: { api: { x: 'far' } }, sizes: {} } });
    const result = importDocument(text);
    expect(result.success).toBe(false);
    expect(!result.success && result.issues[0]).toMatchObject({
      code: 'SCHEMA',
      path: ['layout', 'positions', 'api', 'x'],
    });
  });

  it('rejects what importJson rejects in the graph', () => {
    expect(importDocument('not json')).toMatchObject({
      success: false,
      issues: [{ code: 'INVALID_JSON' }],
    });
    expect(importDocument(JSON.stringify({ graph: { ...graph, schemaVersion: 9 } }))).toMatchObject(
      {
        success: false,
        issues: [{ code: 'UNSUPPORTED_SCHEMA_VERSION' }],
      },
    );
    expect(importDocument(JSON.stringify({ graph: 5, layout: {} })).success).toBe(false);
  });
});
