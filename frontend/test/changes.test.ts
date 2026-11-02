import {
  applyPatch,
  type ArchitectureGraph,
  DEFAULT_NODE_SIZE,
  diffGraphs,
  type DiagramDocument,
  type GraphOperation,
} from '@archdraft/shared';
import { describe, expect, it } from 'vitest';
import {
  changeItems,
  marksOf,
  needsReview,
  previewDocument,
  shouldTidy,
} from '../src/ai/changes.ts';

const GRAPH: ArchitectureGraph = {
  schemaVersion: 1,
  title: 'Shop',
  provider: 'aws',
  nodes: [
    { id: 'net', kind: 'network', label: 'VPC' },
    { id: 'user', kind: 'user', label: 'Customer' },
    { id: 'api', kind: 'service', label: 'API', parentId: 'net' },
    { id: 'db', kind: 'relational-db', label: 'Orders', parentId: 'net' },
  ],
  edges: [
    { id: 'user-api', source: 'user', target: 'api' },
    { id: 'api-db', source: 'api', target: 'db' },
  ],
};

const DOCUMENT: DiagramDocument = {
  graph: GRAPH,
  layout: {
    positions: {
      net: { x: 200, y: 0 },
      user: { x: 0, y: 0 },
      api: { x: 40, y: 40 },
      db: { x: 300, y: 40 },
    },
    sizes: {
      net: { width: 560, height: 160 },
      user: DEFAULT_NODE_SIZE,
      api: DEFAULT_NODE_SIZE,
      db: DEFAULT_NODE_SIZE,
    },
  },
};

function changed(operations: GraphOperation[]) {
  const result = applyPatch(GRAPH, operations);
  if (!result.success) throw new Error('Invalid operations');
  return { graph: result.graph, changes: result.changes };
}

describe('changes of the assistant', () => {
  it('marks what is new, what changes and what goes', () => {
    const { changes } = changed([
      { op: 'addNode', node: { id: 'cache', kind: 'cache', label: 'Cache', parentId: 'net' } },
      { op: 'updateNode', id: 'api', changes: { label: 'Store API' } },
      { op: 'removeEdge', id: 'api-db' },
    ]);
    const marks = marksOf(changes);
    expect(marks.nodes.get('cache')).toBe('added');
    expect(marks.nodes.get('api')).toBe('updated');
    expect(marks.edges.get('api-db')).toBe('removed');
    expect(marks.nodes.has('db')).toBe(false);
  });

  it('lists the changes in words, new first, with what changed in what stays', () => {
    const { graph, changes } = changed([
      { op: 'removeNode', id: 'db' },
      {
        op: 'updateNode',
        id: 'api',
        changes: {
          label: 'Store API',
          kind: 'function',
          parentId: null,
          attributes: { replicas: 2 },
        },
      },
      { op: 'addNode', node: { id: 'cache', kind: 'cache', label: 'Cache' } },
      { op: 'addEdge', edge: { id: 'api-cache', source: 'api', target: 'cache' } },
    ]);
    const items = changeItems(GRAPH, graph, changes);
    expect(
      items.map((item) => (item.type === 'diagram' ? 'diagram' : `${item.mark} ${item.id}`)),
    ).toEqual(['added cache', 'updated api', 'removed db', 'added api-cache', 'removed api-db']);
    const api = items[1];
    expect(api?.type === 'node' && api.details).toEqual([
      { type: 'renamed', from: 'API', to: 'Store API' },
      { type: 'kind', from: 'service', to: 'function' },
      { type: 'moved', into: null },
      { type: 'attributes', names: ['replicas'] },
    ]);
    // A connection that goes still names the part it came from.
    const gone = items[4];
    expect(gone?.type === 'edge' && gone.target?.label).toBe('Orders');
  });

  it('draws what goes where it was, behind what takes its place', () => {
    const { graph, changes } = changed([{ op: 'removeNode', id: 'db' }]);
    const after: DiagramDocument = { graph, layout: { positions: {}, sizes: {} } };
    const preview = previewDocument(DOCUMENT, after, changes, false);
    expect(preview.graph.nodes[0]?.id).toBe('db');
    expect(preview.graph.edges.map((edge) => edge.id)).toContain('api-db');
    expect(preview.layout.positions['db']).toEqual({ x: 300, y: 40 });
    // Laid out again, where it was means nothing.
    expect(previewDocument(DOCUMENT, after, changes, true)).toBe(after);
  });

  it('shows first an edit that removes a part, or touches much of the diagram', () => {
    const proposal = (operations: GraphOperation[]) => ({
      title: 'x',
      rationale: '',
      ...changed(operations),
    });
    expect(needsReview(proposal([{ op: 'removeNode', id: 'db' }]))).toBe(true);
    expect(needsReview(proposal([{ op: 'removeEdge', id: 'api-db' }]))).toBe(false);
    expect(needsReview(proposal([{ op: 'updateNode', id: 'db', changes: { label: 'DB' } }]))).toBe(
      false,
    );
  });

  it('lays the whole diagram out again only when much of it is new, gone or regrouped', () => {
    const small = changed([
      { op: 'addNode', node: { id: 'cache', kind: 'cache', label: 'Cache' } },
    ]);
    expect(shouldTidy(GRAPH, small.graph, small.changes)).toBe(false);
    const large = changed([
      { op: 'updateNode', id: 'api', changes: { parentId: null } },
      { op: 'updateNode', id: 'db', changes: { parentId: null } },
    ]);
    expect(shouldTidy(GRAPH, large.graph, large.changes)).toBe(true);
    const empty = { ...GRAPH, nodes: [], edges: [] };
    expect(shouldTidy(empty, GRAPH, diffGraphs(empty, GRAPH))).toBe(true);
  });
});
