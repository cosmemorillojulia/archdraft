import { describe, expect, it } from 'vitest';
import { type ArchitectureGraph, importJson, toJson } from '../src/index.ts';
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
    expect(result.success).toBe(false);
    expect(!result.success && result.issues).toEqual([
      expect.objectContaining({
        code: 'INVALID_JSON',
        severity: 'error',
        message: expect.stringMatching(/^Not valid JSON: /),
      }),
    ]);
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
