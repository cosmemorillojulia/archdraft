import { describe, expect, it } from 'vitest';
import {
  type ArchitectureGraph,
  applyPatch,
  diffGraphs,
  type GraphOperation,
  GraphPatchSchema,
  hasChanges,
  type PatchResult,
} from '../src/index.ts';
import { threeTierGraph } from './fixtures.ts';

function applied(result: PatchResult): ArchitectureGraph {
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return result.graph;
}

const nodeOf = (graph: ArchitectureGraph, id: string) => graph.nodes.find((node) => node.id === id);
const edgeOf = (graph: ArchitectureGraph, id: string) => graph.edges.find((edge) => edge.id === id);

describe('applyPatch', () => {
  it('adds a node and connects it', () => {
    const result = applyPatch(threeTierGraph(), [
      { op: 'addNode', node: { id: 'logs', kind: 'monitoring', label: 'Logs' } },
      { op: 'addEdge', edge: { id: 'api-logs', source: 'api', target: 'logs', mode: 'async' } },
    ]);
    const graph = applied(result);
    expect(nodeOf(graph, 'logs')).toEqual({ id: 'logs', kind: 'monitoring', label: 'Logs' });
    expect(edgeOf(graph, 'api-logs')?.target).toBe('logs');
    expect(result.success && result.changes).toEqual({
      diagram: false,
      nodes: { added: ['logs'], updated: [], removed: [] },
      edges: { added: ['api-logs'], updated: [], removed: [] },
    });
  });

  it('updates a node: sets fields, removes those set to null and merges attributes', () => {
    const graph = applied(
      applyPatch(threeTierGraph(), [
        {
          op: 'updateNode',
          id: 'db',
          changes: {
            label: 'Orders',
            service: null,
            attributes: { multiAz: null, replicas: 2 },
          },
        },
      ]),
    );
    expect(nodeOf(graph, 'db')).toEqual({
      id: 'db',
      kind: 'relational-db',
      label: 'Orders',
      parentId: 'private',
      attributes: { encryptedAtRest: true, replicas: 2 },
    });
  });

  it('drops the attributes of a node when the last one is forgotten', () => {
    const graph = applied(
      applyPatch(threeTierGraph(), [
        {
          op: 'updateNode',
          id: 'api',
          changes: { attributes: { replicas: null, autoscaling: null } },
        },
      ]),
    );
    expect(nodeOf(graph, 'api')).not.toHaveProperty('attributes');
  });

  it('changes the kind of a node, and moves it out of its container', () => {
    const graph = applied(
      applyPatch(threeTierGraph(), [
        { op: 'updateNode', id: 'api', changes: { kind: 'function', parentId: null } },
      ]),
    );
    expect(nodeOf(graph, 'api')).toMatchObject({ kind: 'function' });
    expect(nodeOf(graph, 'api')).not.toHaveProperty('parentId');
  });

  it('removes a node with its connections', () => {
    const before = threeTierGraph();
    const result = applyPatch(before, [{ op: 'removeNode', id: 'cache' }]);
    const graph = applied(result);
    expect(nodeOf(graph, 'cache')).toBeUndefined();
    expect(graph.edges.some((edge) => edge.source === 'cache' || edge.target === 'cache')).toBe(
      false,
    );
    expect(result.success && result.changes.edges.removed.length).toBe(
      before.edges.filter((edge) => edge.source === 'cache' || edge.target === 'cache').length,
    );
  });

  it('moves what a removed container holds to the container around it', () => {
    const graph = applied(applyPatch(threeTierGraph(), [{ op: 'removeNode', id: 'private' }]));
    expect(nodeOf(graph, 'api')?.parentId).toBe('vpc');
    expect(nodeOf(graph, 'db')?.parentId).toBe('vpc');
  });

  it('takes out of any container what a removed top-level container held', () => {
    const graph = applied(applyPatch(threeTierGraph(), [{ op: 'removeNode', id: 'region' }]));
    expect(nodeOf(graph, 'vpc')).toBeDefined();
    expect(nodeOf(graph, 'vpc')).not.toHaveProperty('parentId');
  });

  it('removes the text fixed to a removed box', () => {
    const graph: ArchitectureGraph = {
      ...threeTierGraph(),
      nodes: [
        ...threeTierGraph().nodes,
        { id: 'step', kind: 'box', label: '' },
        { id: 'caption', kind: 'text', label: 'Step one', attachedTo: 'step' },
      ],
    };
    const result = applied(applyPatch(graph, [{ op: 'removeNode', id: 'step' }]));
    expect(nodeOf(result, 'caption')).toBeUndefined();
  });

  it('updates and removes edges', () => {
    const graph = applied(
      applyPatch(threeTierGraph(), [
        { op: 'updateEdge', id: 'e1', changes: { label: 'Browse', protocol: null } },
        { op: 'removeEdge', id: 'e2' },
      ]),
    );
    expect(edgeOf(graph, 'e1')).toEqual({
      id: 'e1',
      source: 'customer',
      target: 'cdn',
      label: 'Browse',
      mode: 'sync',
    });
    expect(edgeOf(graph, 'e2')).toBeUndefined();
  });

  it('renames the diagram and changes its cloud', () => {
    const graph = applied(
      applyPatch(threeTierGraph(), [
        { op: 'updateDiagram', changes: { title: 'Shop', description: null, provider: 'gcp' } },
      ]),
    );
    expect(graph).toMatchObject({ title: 'Shop', provider: 'gcp' });
    expect(hasChanges(diffGraphs(threeTierGraph(), graph))).toBe(true);
    expect(graph).not.toHaveProperty('description');
  });

  it('reports every operation that refers to what is not there, or adds what is', () => {
    const result = applyPatch(threeTierGraph(), [
      { op: 'addNode', node: { id: 'api', kind: 'service', label: 'Again' } },
      { op: 'updateNode', id: 'ghost', changes: { label: 'Ghost' } },
      { op: 'removeNode', id: 'ghost' },
      { op: 'addEdge', edge: { id: 'e1', source: 'api', target: 'db' } },
      { op: 'updateEdge', id: 'nope', changes: { label: 'x' } },
      { op: 'removeEdge', id: 'nope' },
    ]);
    expect(result.success).toBe(false);
    expect(!result.success && result.issues.map((issue) => issue.operation)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(!result.success && result.issues[1]?.message).toBe('There is no node "ghost" to update');
  });

  it.each<[string, GraphOperation[]]>([
    [
      'a connection to a container',
      [{ op: 'addEdge', edge: { id: 'x', source: 'api', target: 'vpc' } }],
    ],
    [
      'a connection to an unknown node',
      [{ op: 'addEdge', edge: { id: 'x', source: 'api', target: 'nowhere' } }],
    ],
    [
      'a parent that does not exist',
      [{ op: 'updateNode', id: 'api', changes: { parentId: 'nowhere' } }],
    ],
    [
      'containers nested in a loop',
      [{ op: 'updateNode', id: 'vpc', changes: { parentId: 'public' } }],
    ],
    ['a component without a name', [{ op: 'updateNode', id: 'api', changes: { label: '' } }]],
  ])('rejects a patch that would leave %s', (_, operations) => {
    const result = applyPatch(threeTierGraph(), operations);
    expect(result.success).toBe(false);
    expect(!result.success && result.issues.every((issue) => issue.operation === undefined)).toBe(
      true,
    );
  });

  it('does not change the graph it is given', () => {
    const graph = threeTierGraph();
    const copy = structuredClone(graph);
    applyPatch(graph, [
      { op: 'updateNode', id: 'db', changes: { attributes: { multiAz: false } } },
      { op: 'removeNode', id: 'private' },
    ]);
    expect(graph).toEqual(copy);
  });
});

describe('GraphPatchSchema', () => {
  it('accepts operations as the model writes them and rejects unknown ones', () => {
    expect(
      GraphPatchSchema.safeParse([
        { op: 'updateNode', id: 'db', changes: { attributes: { multiAz: true }, service: null } },
      ]).success,
    ).toBe(true);
    expect(GraphPatchSchema.safeParse([{ op: 'renameNode', id: 'db' }]).success).toBe(false);
    expect(
      GraphPatchSchema.safeParse([{ op: 'updateNode', id: 'db', changes: { colour: 'red' } }])
        .success,
    ).toBe(false);
  });
});

describe('diffGraphs', () => {
  it('lists added, changed and removed nodes and edges, ignoring the order of keys', () => {
    const before = threeTierGraph();
    const after: ArchitectureGraph = {
      ...before,
      nodes: [
        ...before.nodes
          .filter((node) => node.id !== 'cache')
          .map((node) =>
            node.id === 'alb'
              ? { label: node.label, kind: node.kind, id: node.id, parentId: 'public' }
              : node,
          )
          .map((node) => (node.id === 'api' ? { ...node, label: 'Shop API' } : node)),
        { id: 'logs', kind: 'monitoring', label: 'Logs' },
      ],
      edges: before.edges.filter((edge) => edge.source !== 'cache' && edge.target !== 'cache'),
    };
    const changes = diffGraphs(before, after);
    expect(changes.nodes).toEqual({ added: ['logs'], updated: ['api'], removed: ['cache'] });
    expect(changes.edges.added).toEqual([]);
    expect(hasChanges(changes)).toBe(true);
    expect(hasChanges(diffGraphs(before, structuredClone(before)))).toBe(false);
  });
});
