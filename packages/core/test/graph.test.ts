import { describe, expect, it } from 'vitest';
import {
  type ArchitectureGraph,
  getAncestors,
  getDescendants,
  indexGraph,
  isContainer,
  resolveProvider,
  resolveServiceName,
} from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

const ids = (nodes: readonly { id: string }[]) => nodes.map((node) => node.id);

describe('indexGraph', () => {
  const index = indexGraph(threeTierGraph());

  it('indexes nodes and edges by id', () => {
    expect(index.nodesById.get('api')?.label).toBe('Store API');
    expect(index.edgesById.get('e5')?.target).toBe('db');
  });

  it('tracks incoming and outgoing edges', () => {
    expect(index.outgoing.get('api')?.map((edge) => edge.target)).toEqual([
      'db',
      'cache',
      'orders-queue',
    ]);
    expect(index.incoming.get('db')?.map((edge) => edge.source)).toEqual(['api', 'worker']);
  });

  it('tracks children and roots', () => {
    expect(ids(index.childrenOf.get('private') ?? [])).toEqual(['api', 'db', 'cache']);
    expect(ids(index.roots)).toEqual([
      'customer',
      'cdn',
      'assets',
      'region',
      'orders-queue',
      'worker',
      'payments',
    ]);
  });

  it('keeps the first occurrence of duplicated ids and skips dangling edges', () => {
    const graph: ArchitectureGraph = {
      schemaVersion: 1,
      title: 'Broken',
      provider: 'generic',
      nodes: [
        { id: 'a', kind: 'vm', label: 'First' },
        { id: 'a', kind: 'vm', label: 'Second' },
        { id: 'b', kind: 'vm', label: 'B', parentId: 'missing' },
      ],
      edges: [
        { id: 'e', source: 'a', target: 'b' },
        { id: 'e', source: 'b', target: 'a' },
        { id: 'dangling', source: 'a', target: 'ghost' },
      ],
    };
    const broken = indexGraph(graph);
    expect(broken.nodesById.get('a')?.label).toBe('First');
    expect(broken.edgesById.get('e')?.source).toBe('a');
    expect(broken.outgoing.get('a')?.map((edge) => edge.id)).toEqual(['e']);
    expect(ids(broken.roots)).toEqual(['a', 'b']);
  });
});

describe('getAncestors / getDescendants', () => {
  const index = indexGraph(threeTierGraph());

  it('walks up from the closest parent', () => {
    expect(ids(getAncestors(index, 'api'))).toEqual(['private', 'vpc', 'region']);
    expect(getAncestors(index, 'customer')).toEqual([]);
    expect(getAncestors(index, 'unknown')).toEqual([]);
  });

  it('collects nested nodes breadth first', () => {
    expect(ids(getDescendants(index, 'vpc'))).toEqual([
      'public',
      'private',
      'alb',
      'api',
      'db',
      'cache',
    ]);
    expect(getDescendants(index, 'api')).toEqual([]);
  });

  it('terminates on parent cycles', () => {
    const cyclic = indexGraph({
      schemaVersion: 1,
      title: 'Cycle',
      provider: 'generic',
      nodes: [
        { id: 'root', kind: 'boundary', label: 'Root' },
        { id: 'a', kind: 'boundary', label: 'A', parentId: 'b' },
        { id: 'b', kind: 'boundary', label: 'B', parentId: 'a' },
      ],
      edges: [],
    });
    expect(ids(getAncestors(cyclic, 'a'))).toEqual(['b']);
    expect(ids(getDescendants(cyclic, 'a'))).toEqual(['b']);
  });

  it('stops at a dangling parent reference', () => {
    const dangling = indexGraph({
      schemaVersion: 1,
      title: 'Dangling',
      provider: 'generic',
      nodes: [{ id: 'a', kind: 'vm', label: 'A', parentId: 'ghost' }],
      edges: [],
    });
    expect(getAncestors(dangling, 'a')).toEqual([]);
  });
});

describe('provider and service resolution', () => {
  const graph = threeTierGraph();
  const node = (id: string) => {
    const found = graph.nodes.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`fixture has no node ${id}`);
    return found;
  };

  it('inherits the graph provider unless overridden', () => {
    expect(resolveProvider(node('api'), graph)).toBe('aws');
    expect(resolveProvider(node('payments'), graph)).toBe('generic');
  });

  it('prefers the explicit service, then the catalog, then the label', () => {
    expect(resolveServiceName(node('db'), graph)).toBe('Amazon Aurora');
    expect(resolveServiceName(node('api'), graph)).toBe('Amazon ECS');
    expect(resolveServiceName(node('payments'), graph)).toBe('External system');
    expect(resolveServiceName(node('customer'), graph)).toBe('User');
  });

  it('falls back to the kind label when a provider has no mapping', () => {
    const search = { id: 's', kind: 'search-index' as const, label: 'Search' };
    expect(resolveServiceName(search, { ...graph, provider: 'gcp' })).toBe('Search index');
  });

  it('identifies containers', () => {
    expect(isContainer(node('vpc'))).toBe(true);
    expect(isContainer(node('api'))).toBe(false);
  });
});
