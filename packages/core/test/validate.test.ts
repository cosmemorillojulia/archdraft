import { describe, expect, it } from 'vitest';
import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  type ValidationCode,
  parseArchitectureGraph,
  validateGraph,
} from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

function graphWith(nodes: ArchNode[], edges: ArchEdge[] = []): ArchitectureGraph {
  return { schemaVersion: 1, title: 'Test', provider: 'generic', nodes, edges };
}

const codes = (graph: ArchitectureGraph): ValidationCode[] =>
  validateGraph(graph).map((issue) => issue.code);

describe('validateGraph', () => {
  it('finds no issues in a well formed graph', () => {
    expect(validateGraph(threeTierGraph())).toEqual([]);
  });

  it('lets shapes and text have no name, but not anything else', () => {
    const graph = graphWith([
      { id: 'a', kind: 'box', label: '' },
      { id: 'b', kind: 'text', label: '' },
      { id: 'c', kind: 'vm', label: '' },
    ]);
    expect(validateGraph(graph)).toMatchObject([{ code: 'EMPTY_LABEL', nodeIds: ['c'] }]);
  });

  it('reports duplicate node and edge ids', () => {
    const graph = graphWith(
      [
        { id: 'a', kind: 'vm', label: 'A' },
        { id: 'a', kind: 'vm', label: 'A again' },
        { id: 'b', kind: 'vm', label: 'B' },
      ],
      [
        { id: 'e', source: 'a', target: 'b' },
        { id: 'e', source: 'b', target: 'a' },
      ],
    );
    expect(codes(graph)).toEqual(['DUPLICATE_NODE_ID', 'DUPLICATE_EDGE_ID']);
  });

  it('reports edges to unknown nodes', () => {
    const graph = graphWith(
      [{ id: 'a', kind: 'vm', label: 'A' }],
      [
        { id: 'out', source: 'a', target: 'ghost' },
        { id: 'in', source: 'ghost', target: 'a' },
      ],
    );
    expect(codes(graph)).toEqual(['EDGE_UNKNOWN_TARGET', 'EDGE_UNKNOWN_SOURCE']);
  });

  it('reports self loops', () => {
    const graph = graphWith(
      [{ id: 'a', kind: 'vm', label: 'A' }],
      [{ id: 'loop', source: 'a', target: 'a' }],
    );
    const [issue] = validateGraph(graph);
    expect(issue).toMatchObject({ code: 'EDGE_SELF_LOOP', edgeId: 'loop', nodeIds: ['a'] });
  });

  it('rejects edges that touch containers', () => {
    const graph = graphWith(
      [
        { id: 'vpc', kind: 'network', label: 'VPC' },
        { id: 'a', kind: 'vm', label: 'A' },
      ],
      [{ id: 'e', source: 'a', target: 'vpc' }],
    );
    expect(validateGraph(graph)).toMatchObject([
      { code: 'EDGE_ENDPOINT_IS_CONTAINER', nodeIds: ['vpc'] },
    ]);
  });

  it('reports a container self loop once per problem', () => {
    const graph = graphWith(
      [{ id: 'vpc', kind: 'network', label: 'VPC' }],
      [{ id: 'e', source: 'vpc', target: 'vpc' }],
    );
    expect(codes(graph)).toEqual(['EDGE_SELF_LOOP', 'EDGE_ENDPOINT_IS_CONTAINER']);
  });

  it('warns about repeated connections with the same protocol', () => {
    const nodes: ArchNode[] = [
      { id: 'a', kind: 'vm', label: 'A' },
      { id: 'b', kind: 'vm', label: 'B' },
    ];
    const repeated = graphWith(nodes, [
      { id: 'e1', source: 'a', target: 'b', protocol: 'http' },
      { id: 'e2', source: 'a', target: 'b', protocol: 'http' },
    ]);
    expect(validateGraph(repeated)).toMatchObject([
      { code: 'DUPLICATE_EDGE', severity: 'warning' },
    ]);

    const differentProtocols = graphWith(nodes, [
      { id: 'e1', source: 'a', target: 'b', protocol: 'http' },
      { id: 'e2', source: 'a', target: 'b', protocol: 'grpc' },
    ]);
    expect(validateGraph(differentProtocols)).toEqual([]);
  });

  it('reports unknown and non-container parents', () => {
    const graph = graphWith([
      { id: 'a', kind: 'vm', label: 'A', parentId: 'ghost' },
      { id: 'b', kind: 'vm', label: 'B' },
      { id: 'c', kind: 'vm', label: 'C', parentId: 'b' },
    ]);
    expect(codes(graph)).toEqual(['PARENT_NOT_FOUND', 'PARENT_NOT_CONTAINER']);
  });

  it('reports a parent cycle once', () => {
    const graph = graphWith([
      { id: 'x', kind: 'boundary', label: 'X', parentId: 'z' },
      { id: 'y', kind: 'boundary', label: 'Y', parentId: 'x' },
      { id: 'z', kind: 'boundary', label: 'Z', parentId: 'y' },
    ]);
    const issues = validateGraph(graph);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'PARENT_CYCLE' });
    expect([...(issues[0]?.nodeIds ?? [])].sort()).toEqual(['x', 'y', 'z']);
  });

  it('enforces containment rules between containers', () => {
    const graph = graphWith([
      { id: 'region', kind: 'region', label: 'Region' },
      { id: 'vpc', kind: 'network', label: 'VPC', parentId: 'region' },
      { id: 'inner-region', kind: 'region', label: 'Nested region', parentId: 'vpc' },
    ]);
    expect(validateGraph(graph)).toMatchObject([
      { code: 'INVALID_CONTAINMENT', nodeIds: ['inner-region', 'vpc'] },
    ]);
  });

  it('requires subnets and zones to live inside a container', () => {
    const graph = graphWith([
      { id: 'subnet', kind: 'subnet', label: 'Subnet' },
      { id: 'az', kind: 'availability-zone', label: 'AZ' },
    ]);
    expect(codes(graph)).toEqual(['INVALID_CONTAINMENT', 'INVALID_CONTAINMENT']);
  });

  it('lets components and boundaries nest anywhere', () => {
    const graph = graphWith([
      { id: 'team', kind: 'boundary', label: 'Team' },
      { id: 'region', kind: 'region', label: 'Region', parentId: 'team' },
      { id: 'domain', kind: 'boundary', label: 'Domain', parentId: 'region' },
      { id: 'svc', kind: 'service', label: 'Service', parentId: 'domain' },
    ]);
    expect(validateGraph(graph)).toEqual([]);
  });
});

describe('parseArchitectureGraph', () => {
  it('returns the parsed graph and its warnings', () => {
    const graph = threeTierGraph();
    graph.edges.push({ id: 'dup', source: 'customer', target: 'cdn', protocol: 'https' });
    const result = parseArchitectureGraph(graph);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.graph.title).toBe('Online store');
      expect(result.warnings.map((issue) => issue.code)).toEqual(['DUPLICATE_EDGE']);
    }
  });

  it('maps schema errors to SCHEMA issues with a path', () => {
    const result = parseArchitectureGraph({ ...threeTierGraph(), provider: 'oracle' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]).toMatchObject({ code: 'SCHEMA', path: ['provider'] });
      expect(result.issues[0]?.message).toMatch(/^provider: /);
    }
  });

  it('reports root-level schema errors without a path prefix', () => {
    const result = parseArchitectureGraph('not a graph');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues[0]?.path).toEqual([]);
  });

  it('fails when structural errors exist', () => {
    const result = parseArchitectureGraph(
      graphWith([{ id: 'a', kind: 'vm', label: 'A', parentId: 'ghost' }]),
    );
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.issues.map((issue) => issue.code)).toEqual(['PARENT_NOT_FOUND']);
  });

  it('never throws on arbitrary input', () => {
    for (const input of [null, undefined, 42, [], {}, { nodes: 'x' }]) {
      expect(() => parseArchitectureGraph(input)).not.toThrow();
    }
  });
});
