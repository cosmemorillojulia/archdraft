import { describe, expect, it } from 'vitest';
import {
  ArchitectureGraphSchema,
  ArchNodeSchema,
  IdSchema,
  LIMITS,
  SCHEMA_VERSION,
  createEmptyGraph,
} from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

describe('ArchitectureGraphSchema', () => {
  it('accepts a realistic graph', () => {
    expect(ArchitectureGraphSchema.safeParse(threeTierGraph()).success).toBe(true);
  });

  it('rejects unknown node kinds', () => {
    const graph = threeTierGraph();
    const result = ArchitectureGraphSchema.safeParse({
      ...graph,
      nodes: [...graph.nodes, { id: 'x', kind: 'mainframe', label: 'X' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unexpected properties instead of silently dropping them', () => {
    const result = ArchNodeSchema.safeParse({ id: 'a', kind: 'vm', label: 'A', colour: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown attributes', () => {
    const result = ArchNodeSchema.safeParse({
      id: 'a',
      kind: 'vm',
      label: 'A',
      attributes: { gpu: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects other schema versions', () => {
    const result = ArchitectureGraphSchema.safeParse({ ...threeTierGraph(), schemaVersion: 2 });
    expect(result.success).toBe(false);
  });

  it('trims labels and rejects blank ones', () => {
    const trimmed = ArchNodeSchema.parse({ id: 'a', kind: 'vm', label: '  Web  ' });
    expect(trimmed.label).toBe('Web');
    expect(ArchNodeSchema.safeParse({ id: 'a', kind: 'vm', label: '   ' }).success).toBe(false);
  });

  it('enforces the node limit', () => {
    const nodes = Array.from({ length: LIMITS.maxNodes + 1 }, (_, i) => ({
      id: `n${i}`,
      kind: 'vm' as const,
      label: `Node ${i}`,
    }));
    const result = ArchitectureGraphSchema.safeParse({ ...createEmptyGraph('Big'), nodes });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer replica counts', () => {
    const result = ArchNodeSchema.safeParse({
      id: 'a',
      kind: 'service',
      label: 'A',
      attributes: { replicas: 1.5 },
    });
    expect(result.success).toBe(false);
  });
});

describe('IdSchema', () => {
  it.each(['orders-db', 'api_v2', 'A1', 'x'])('accepts %s', (id) => {
    expect(IdSchema.safeParse(id).success).toBe(true);
  });

  it.each(['', '-leading', 'has space', 'ñandú', 'a'.repeat(LIMITS.idLength + 1)])(
    'rejects %j',
    (id) => {
      expect(IdSchema.safeParse(id).success).toBe(false);
    },
  );
});

describe('createEmptyGraph', () => {
  it('produces a valid graph with the generic provider by default', () => {
    const graph = createEmptyGraph('Draft');
    expect(graph).toEqual({
      schemaVersion: SCHEMA_VERSION,
      title: 'Draft',
      provider: 'generic',
      nodes: [],
      edges: [],
    });
    expect(ArchitectureGraphSchema.safeParse(graph).success).toBe(true);
  });

  it('accepts an explicit provider', () => {
    expect(createEmptyGraph('Draft', 'gcp').provider).toBe('gcp');
  });
});
