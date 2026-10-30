import {
  type ArchitectureGraph,
  CONTAINER_PADDING,
  DEFAULT_NODE_SIZE,
  type DiagramDocument,
  LIMITS,
  validateGraph,
} from '@archdraft/core';
import { describe, expect, it } from 'vitest';
import { absoluteBoxes } from '../src/canvas/geometry.ts';
import {
  addNode,
  canContain,
  canStack,
  moveNodes,
  removeNodes,
  stackNode,
  updateDiagram,
  connect,
  containerAt,
  duplicate,
  type Edit,
  moveNode,
  fitResize,
  MIN_SIZES,
  minSizeOf,
  NUDGE,
  remove,
  resizeNode,
  setDefaultEdgeStyle,
  setEdgeStyle,
  subtreeOf,
  uniqueId,
  uniqueLabel,
  updateEdge,
  updateNode,
  drawnSize,
} from '../src/editor/operations.ts';
import { en as strings } from '../src/i18n/en.ts';

/*
 * A region holding a network with one subnet, a service inside the subnet,
 * and a user and a database at the top level.
 *
 *   user (0,100)   region (300,0) 600×400
 *                    vpc (24,48) 500×300
 *                      subnet (24,48) 300×200
 *                        api (24,48)
 *   db (1000,100)
 */
const graph: ArchitectureGraph = {
  schemaVersion: 1,
  title: 'Test',
  provider: 'aws',
  nodes: [
    { id: 'user', kind: 'user', label: 'User' },
    { id: 'region', kind: 'region', label: 'Region' },
    { id: 'vpc', kind: 'network', label: 'VPC', parentId: 'region' },
    { id: 'subnet', kind: 'subnet', label: 'Subnet', parentId: 'vpc' },
    { id: 'api', kind: 'service', label: 'API', parentId: 'subnet' },
    { id: 'db', kind: 'relational-db', label: 'Database' },
  ],
  edges: [
    { id: 'user-api', source: 'user', target: 'api', protocol: 'https' },
    { id: 'api-db', source: 'api', target: 'db', protocol: 'sql' },
  ],
};

const document: DiagramDocument = {
  graph,
  layout: {
    positions: {
      user: { x: 0, y: 100 },
      region: { x: 300, y: 0 },
      vpc: { x: 24, y: 48 },
      subnet: { x: 24, y: 48 },
      api: { x: 24, y: 48 },
      db: { x: 1000, y: 100 },
    },
    sizes: {
      user: DEFAULT_NODE_SIZE,
      region: { width: 600, height: 400 },
      vpc: { width: 500, height: 300 },
      subnet: { width: 300, height: 200 },
      api: DEFAULT_NODE_SIZE,
      db: DEFAULT_NODE_SIZE,
    },
  },
};

/** The document of a successful edit; fails the test otherwise. */
function edited(edit: Edit): DiagramDocument {
  if (!edit.ok) throw new Error(`Edit rejected: ${edit.reason}`);
  return edit.document;
}

const nodeOf = (doc: DiagramDocument, id: string) => doc.graph.nodes.find((node) => node.id === id);
const errorsOf = (doc: DiagramDocument) =>
  validateGraph(doc.graph).filter((issue) => issue.severity === 'error');

describe('names of new elements', () => {
  it('keeps a free id and numbers a taken one', () => {
    expect(uniqueId('cache', new Set(['api']))).toBe('cache');
    expect(uniqueId('cache', new Set(['cache', 'cache-2']))).toBe('cache-3');
  });

  it('keeps numbered ids within the length limit', () => {
    const long = 'a'.repeat(LIMITS.idLength);
    const id = uniqueId(long, new Set([long]));
    expect(id).toHaveLength(LIMITS.idLength);
    expect(id.endsWith('-2')).toBe(true);
  });

  it('numbers repeated labels from the base name', () => {
    expect(uniqueLabel('Cache', new Set(['API']))).toBe('Cache');
    expect(uniqueLabel('Cache', new Set(['Cache']))).toBe('Cache 2');
    expect(uniqueLabel('Cache 2', new Set(['Cache', 'Cache 2']))).toBe('Cache 3');
  });
});

describe('containment', () => {
  it('lets any container hold components, and follows the rules for groups', () => {
    expect(canContain('subnet', 'service')).toBe(true);
    expect(canContain('network', 'subnet')).toBe(true);
    expect(canContain('region', 'subnet')).toBe(false);
  });

  it('finds the innermost container under a point that can hold the kind', () => {
    // (400, 150) is inside the subnet, which is inside the network and the region.
    expect(containerAt(document, { x: 400, y: 150 }, 'service')).toBe('subnet');
    // A subnet cannot nest in a subnet, but it can go in the network around it.
    expect(containerAt(document, { x: 400, y: 150 }, 'subnet')).toBe('vpc');
    expect(containerAt(document, { x: 50, y: 50 }, 'service')).toBeUndefined();
  });

  it('collects a node and everything nested inside it', () => {
    expect(subtreeOf(graph, 'region')).toEqual(new Set(['region', 'vpc', 'subnet', 'api']));
    expect(subtreeOf(graph, 'db')).toEqual(new Set(['db']));
  });
});

describe('addNode', () => {
  it('adds a component centred on a free point at the top level and selects it', () => {
    const edit = addNode(document, 'cache', { x: 100, y: 600 });
    const next = edited(edit);
    expect(nodeOf(next, 'cache')).toEqual({ id: 'cache', kind: 'cache', label: 'Cache' });
    expect(next.layout.positions.cache).toEqual({ x: 10, y: 568 });
    expect(next.layout.sizes.cache).toEqual(DEFAULT_NODE_SIZE);
    expect(edit.ok && edit.selection).toEqual({ type: 'node', id: 'cache' });
  });

  it('keeps a node put by hand exactly where it was put, even over another node', () => {
    const other = [...absoluteBoxes(document.graph, document.layout).values()][0]!;
    const centre = { x: other.x + other.width / 2, y: other.y + other.height / 2 };
    const size = { width: 140, height: 60 };
    const next = edited(addNode(document, 'box', centre, { size, exact: true }));
    const placed = absoluteBoxes(next.graph, next.layout).get('box');
    expect(placed).toEqual({
      x: Math.round(centre.x - 70),
      y: Math.round(centre.y - 30),
      ...size,
    });
    const moved = edited(addNode(document, 'box', centre, { size }));
    expect(absoluteBoxes(moved.graph, moved.layout).get('box')).not.toEqual(placed);
  });

  it('leaves a node put by hand outside a container it only half covers', () => {
    const vpc = absoluteBoxes(document.graph, document.layout).get('vpc')!;
    const centre = { x: vpc.x + vpc.width - 10, y: vpc.y + vpc.height / 2 };
    const size = { width: 100, height: 60 };
    const exact = edited(addNode(document, 'box', centre, { size, exact: true }));
    expect(nodeOf(exact, 'box')?.parentId).toBeUndefined();
    expect(absoluteBoxes(exact.graph, exact.layout).get('box')?.x).toBe(Math.round(centre.x - 50));
  });

  it('places a component dropped on a container inside it', () => {
    const next = edited(addNode(document, 'cache', { x: 700, y: 300 }));
    expect(nodeOf(next, 'cache')?.parentId).toBe('vpc');
    expect(errorsOf(next)).toEqual([]);
  });

  it('moves a new node off the nodes already there', () => {
    // Centred on the API, inside the subnet.
    const next = edited(addNode(document, 'cache', { x: 438, y: 176 }));
    const cache = next.layout.positions.cache;
    const api = { x: 24, y: 48, ...DEFAULT_NODE_SIZE };
    expect(nodeOf(next, 'cache')?.parentId).toBe('subnet');
    expect(cache).toBeDefined();
    const separated =
      cache!.x >= api.x + api.width ||
      cache!.x + DEFAULT_NODE_SIZE.width <= api.x ||
      cache!.y >= api.y + api.height ||
      cache!.y + DEFAULT_NODE_SIZE.height <= api.y;
    expect(separated).toBe(true);
  });

  it('grows the containers around a node that does not fit', () => {
    // Near the right border of the subnet, which grows to hold it.
    const next = edited(addNode(document, 'cache', { x: 640, y: 120 }));
    expect(nodeOf(next, 'cache')?.parentId).toBe('subnet');
    const cache = next.layout.positions.cache!;
    const subnet = { ...next.layout.positions.subnet!, ...next.layout.sizes.subnet! };
    expect(subnet.width).toBe(cache.x + DEFAULT_NODE_SIZE.width + CONTAINER_PADDING.right);
    expect(next.layout.sizes.vpc!.width).toBeGreaterThanOrEqual(
      subnet.x + subnet.width + CONTAINER_PADDING.right,
    );
  });

  it('numbers the id and the name when the kind is already there', () => {
    const next = edited(addNode(document, 'service', { x: 100, y: 600 }));
    expect(nodeOf(next, 'service')).toMatchObject({ label: 'Service' });
    const again = edited(addNode(next, 'service', { x: 100, y: 800 }));
    expect(nodeOf(again, 'service-2')).toMatchObject({ label: 'Service 2' });
  });

  it('leaves a group that needs a parent at the top level, for validation to reject', () => {
    const next = edited(addNode(document, 'subnet', { x: 100, y: 600 }));
    expect(errorsOf(next).map((issue) => issue.code)).toEqual(['INVALID_CONTAINMENT']);
  });

  it('refuses to go past the node limit', () => {
    const full: DiagramDocument = {
      ...document,
      graph: {
        ...graph,
        nodes: Array.from({ length: LIMITS.maxNodes }, (_, index) => ({
          id: `n${index}`,
          kind: 'service' as const,
          label: `N${index}`,
        })),
        edges: [],
      },
    };
    expect(addNode(full, 'cache', { x: 0, y: 0 })).toEqual({
      ok: false,
      reason: strings.edit.tooManyNodes,
    });
  });
});

describe('connect', () => {
  it('adds an edge named after its ends and selects it', () => {
    const edit = connect(document, 'user', 'db');
    const next = edited(edit);
    expect(next.graph.edges.at(-1)).toEqual({ id: 'user-db', source: 'user', target: 'db' });
    expect(edit.ok && edit.selection).toEqual({ type: 'edge', id: 'user-db' });
  });

  it('refuses to repeat a connection', () => {
    expect(connect(document, 'user', 'api')).toEqual({
      ok: false,
      reason: strings.edit.alreadyConnected,
    });
  });

  it('leaves connections to groups for validation to reject', () => {
    const next = edited(connect(document, 'user', 'vpc'));
    expect(errorsOf(next).map((issue) => issue.code)).toEqual(['EDGE_ENDPOINT_IS_CONTAINER']);
  });
});

describe('moveNode', () => {
  it('moves a node within its container', () => {
    const next = edited(moveNode(document, 'api', { x: 80, y: 90 }));
    expect(next.layout.positions.api).toEqual({ x: 80, y: 90 });
    expect(nodeOf(next, 'api')?.parentId).toBe('subnet');
  });

  it('changes nothing when the node did not move', () => {
    expect(moveNode(document, 'api', { x: 24, y: 48 })).toEqual({ ok: true, document });
  });

  it('takes a node out of every container when it lands outside them', () => {
    // From the subnet (absolute 348, 96) to absolute (40, 500).
    const next = edited(moveNode(document, 'api', { x: 40 - 348, y: 500 - 96 }));
    expect(nodeOf(next, 'api')).not.toHaveProperty('parentId');
    expect(next.layout.positions.api).toEqual({ x: 40, y: 500 });
  });

  it('moves a node into the container it is dropped on, relative to it', () => {
    // The user, dropped with its centre inside the subnet.
    const next = edited(moveNode(document, 'user', { x: 380, y: 160 }));
    expect(nodeOf(next, 'user')?.parentId).toBe('subnet');
    // Absolute (380, 160) minus the subnet at (348, 96).
    expect(next.layout.positions.user).toEqual({ x: 32, y: 64 });
    // Drawn above the nodes it joins.
    expect(next.graph.nodes.at(-1)?.id).toBe('user');
    expect(errorsOf(next)).toEqual([]);
  });

  it('keeps a node clear of the border and title of its container', () => {
    const next = edited(moveNode(document, 'api', { x: 2, y: 100 }));
    expect(next.layout.positions.api).toEqual({ x: CONTAINER_PADDING.left, y: 100 });
    const top = edited(moveNode(document, 'api', { x: 60, y: 10 }));
    expect(top.layout.positions.api).toEqual({ x: 60, y: CONTAINER_PADDING.top });
  });

  it('never moves a container into itself or its contents', () => {
    // The network dragged a little: its centre is over its own subnet.
    const next = edited(moveNode(document, 'vpc', { x: 30, y: 52 }));
    expect(nodeOf(next, 'vpc')?.parentId).toBe('region');
  });

  it('leaves a group dropped where it cannot go for validation to reject', () => {
    // The subnet dragged out of the region, to the top level.
    const next = edited(moveNode(document, 'subnet', { x: -400, y: 500 }));
    expect(errorsOf(next).map((issue) => issue.code)).toEqual(['INVALID_CONTAINMENT']);
  });
});

describe('resizeNode', () => {
  it('rounds the edges to whole pixels', () => {
    const next = edited(
      resizeNode(document, 'db', { x: 990.4, y: 80.6, width: 240.2, height: 99.7 }),
    );
    expect(next.layout.positions.db).toEqual({ x: 990, y: 81 });
    // Right edge 1230.6 and bottom edge 180.3, rounded.
    expect(next.layout.sizes.db).toEqual({ width: 241, height: 99 });
  });

  it('changes nothing when the box is the same', () => {
    expect(resizeNode(document, 'db', { x: 1000, y: 100, ...DEFAULT_NODE_SIZE })).toEqual({
      ok: true,
      document,
    });
    expect(resizeNode(document, 'missing', { x: 0, y: 0, width: 10, height: 10 })).toEqual({
      ok: true,
      document,
    });
  });

  it('keeps a component above its minimum size', () => {
    const next = edited(resizeNode(document, 'db', { x: 1000, y: 100, width: 20, height: 10 }));
    expect(next.layout.sizes.db).toEqual(MIN_SIZES.component);
    expect(minSizeOf('circle')).toEqual(MIN_SIZES.shape);
    expect(minSizeOf('subnet')).toEqual(MIN_SIZES.container);
  });

  it('keeps the node clear of the border of its container, with the other edges in place', () => {
    const next = edited(resizeNode(document, 'api', { x: 0, y: 48, width: 400, height: 300 }));
    expect(next.layout.positions.api).toEqual({ x: CONTAINER_PADDING.left, y: 48 });
    expect(next.layout.sizes.api).toEqual({ width: 400 - CONTAINER_PADDING.left, height: 300 });
    // The subnet grows to hold it, and the network to hold the subnet.
    expect(next.layout.sizes.subnet).toEqual({
      width: 400 + CONTAINER_PADDING.right,
      height: 48 + 300 + CONTAINER_PADDING.bottom,
    });
    expect(next.layout.sizes.vpc?.width).toBeGreaterThanOrEqual(
      24 + (next.layout.sizes.subnet?.width ?? 0) + CONTAINER_PADDING.right,
    );
  });

  it('never makes a group smaller than what it holds', () => {
    // The subnet (300 × 200) holds the API at (24, 48), 180 × 64.
    const { box } = fitResize(document, 'subnet', { x: 24, y: 48, width: 50, height: 50 });
    expect(box).toEqual({
      x: 24,
      y: 48,
      width: 24 + DEFAULT_NODE_SIZE.width + CONTAINER_PADDING.right,
      height: 48 + DEFAULT_NODE_SIZE.height + CONTAINER_PADDING.bottom,
    });
  });

  it('keeps the contents of a group where they are when its top or left edge moves', () => {
    const grown = edited(
      resizeNode(document, 'region', { x: 260, y: -20, width: 640, height: 420 }),
    );
    // The region's origin moved by (-40, -20); its children move by (40, 20) inside it.
    expect(grown.layout.positions.region).toEqual({ x: 260, y: -20 });
    expect(grown.layout.positions.vpc).toEqual({ x: 64, y: 68 });
    // Their place on the canvas has not changed.
    const before = absoluteBoxes(document.graph, document.layout).get('api');
    const after = absoluteBoxes(grown.graph, grown.layout).get('api');
    expect(after).toEqual(before);
  });
});

describe('remove', () => {
  it('removes an edge', () => {
    const next = edited(remove(document, { type: 'edge', id: 'api-db' }));
    expect(next.graph.edges.map((edge) => edge.id)).toEqual(['user-api']);
  });

  it('removes a container with its contents, their edges and their layout', () => {
    const edit = remove(document, { type: 'node', id: 'vpc' });
    const next = edited(edit);
    expect(next.graph.nodes.map((node) => node.id)).toEqual(['user', 'region', 'db']);
    expect(next.graph.edges).toEqual([]);
    expect(Object.keys(next.layout.positions)).toEqual(['user', 'region', 'db']);
    expect(Object.keys(next.layout.sizes)).toEqual(['user', 'region', 'db']);
    expect(edit.ok && edit.selection).toBeNull();
  });
});

describe('duplicate', () => {
  it('copies a component next to the original and selects the copy', () => {
    const edit = duplicate(document, 'api');
    const next = edited(edit);
    expect(nodeOf(next, 'api-2')).toEqual({
      id: 'api-2',
      kind: 'service',
      label: 'API 2',
      parentId: 'subnet',
    });
    expect(next.layout.positions['api-2']).toEqual({ x: 24 + NUDGE, y: 48 + NUDGE });
    expect(edit.ok && edit.selection).toEqual({ type: 'node', id: 'api-2' });
    expect(next.graph.edges).toHaveLength(2);
  });

  it('copies a container with its contents and the edges between them', () => {
    const withInner: DiagramDocument = {
      ...document,
      graph: {
        ...graph,
        nodes: [
          ...graph.nodes,
          { id: 'worker', kind: 'service', label: 'Worker', parentId: 'vpc' },
        ],
        edges: [...graph.edges, { id: 'api-worker', source: 'api', target: 'worker' }],
      },
      layout: {
        positions: { ...document.layout.positions, worker: { x: 340, y: 48 } },
        sizes: { ...document.layout.sizes, worker: DEFAULT_NODE_SIZE },
      },
    };
    const next = edited(duplicate(withInner, 'vpc'));
    expect(nodeOf(next, 'vpc-2')).toMatchObject({ label: 'VPC 2', parentId: 'region' });
    expect(nodeOf(next, 'subnet-2')).toMatchObject({ parentId: 'vpc-2' });
    expect(nodeOf(next, 'api-2')).toMatchObject({ parentId: 'subnet-2' });
    expect(nodeOf(next, 'worker-2')).toMatchObject({ parentId: 'vpc-2' });
    // Contents keep their place inside the copy.
    expect(next.layout.positions['subnet-2']).toEqual({ x: 24, y: 48 });
    // Only the edge inside the copied group is copied.
    expect(next.graph.edges.at(-1)).toEqual({
      id: 'api-2-worker-2',
      source: 'api-2',
      target: 'worker-2',
    });
    expect(next.graph.edges).toHaveLength(4);
    expect(errorsOf(next)).toEqual([]);
  });
});

describe('updates', () => {
  it('sets and removes node fields', () => {
    const next = edited(
      updateNode(document, 'api', { label: 'Orders API', service: 'Fargate', provider: 'aws' }),
    );
    expect(nodeOf(next, 'api')).toMatchObject({ label: 'Orders API', service: 'Fargate' });
    const cleared = edited(updateNode(next, 'api', { service: undefined, provider: undefined }));
    expect(nodeOf(cleared, 'api')).not.toHaveProperty('service');
    expect(nodeOf(cleared, 'api')).not.toHaveProperty('provider');
  });

  it('changes nothing when the values are the same', () => {
    expect(updateNode(document, 'api', { label: 'API' })).toEqual({ ok: true, document });
    expect(updateEdge(document, 'api-db', { protocol: 'sql' })).toEqual({ ok: true, document });
  });

  it('sets and removes edge fields', () => {
    const next = edited(updateEdge(document, 'api-db', { protocol: undefined, mode: 'async' }));
    expect(next.graph.edges[1]).toEqual({
      id: 'api-db',
      source: 'api',
      target: 'db',
      mode: 'async',
    });
  });
});

describe('drawnSize', () => {
  it('keeps the size dragged, rounded', () => {
    expect(drawnSize('box', { width: 200.4, height: 159.6 })).toEqual({ width: 200, height: 160 });
  });

  it('never goes below the smallest size of the kind', () => {
    expect(drawnSize('box', { width: 3, height: 10 })).toEqual({ width: 40, height: 40 });
    expect(drawnSize('service', { width: 20, height: 20 })).toEqual({ width: 132, height: 52 });
  });

  it('makes a circle as wide as it is tall', () => {
    expect(drawnSize('circle', { width: 120, height: 60 })).toEqual({ width: 120, height: 120 });
  });
});

describe('shapes without a name', () => {
  it('are born blank, any number of them, and text too', () => {
    let next = document;
    for (const kind of ['box', 'box', 'text'] as const) {
      next = edited(addNode(next, kind, { x: 100, y: 700 + next.graph.nodes.length * 100 }));
    }
    const added = next.graph.nodes.slice(document.graph.nodes.length);
    expect(added.map((node) => node.label)).toEqual(['', '', '']);
    expect(added.map((node) => node.kind)).toEqual(['box', 'box', 'text']);
  });
});

describe('stackNode', () => {
  const ids = (doc: DiagramDocument, parentId?: string) =>
    doc.graph.nodes.filter((node) => node.parentId === parentId).map((node) => node.id);

  it('moves a node to the front, back or one step, among the nodes of its container', () => {
    expect(ids(edited(stackNode(document, 'user', 'front')))).toEqual(['region', 'db', 'user']);
    expect(ids(edited(stackNode(document, 'db', 'back')))).toEqual(['db', 'user', 'region']);
    expect(ids(edited(stackNode(document, 'user', 'forward')))).toEqual(['region', 'user', 'db']);
    expect(ids(edited(stackNode(document, 'db', 'backward')))).toEqual(['user', 'db', 'region']);
  });

  it('leaves the rest of the list where it is, and changes nothing at the ends', () => {
    const next = edited(stackNode(document, 'user', 'front'));
    expect(next.graph.nodes.map((node) => node.id)).toEqual([
      'region',
      'db',
      'vpc',
      'subnet',
      'api',
      'user',
    ]);
    expect(next.graph.nodes.find((node) => node.id === 'vpc')?.parentId).toBe('region');
    expect(stackNode(document, 'db', 'front')).toMatchObject({ ok: true, document });
    expect(stackNode(document, 'user', 'back')).toMatchObject({ ok: true, document });
    expect(canStack(document.graph, 'user')).toEqual({ forward: true, backward: false });
    expect(canStack(document.graph, 'db')).toEqual({ forward: false, backward: true });
  });
});

describe('several nodes at once', () => {
  it('moves them in one edit and deletes them with what they hold', () => {
    const moved = edited(
      moveNodes(document, [
        { id: 'user', position: { x: 10, y: 20 } },
        { id: 'db', position: { x: 1010, y: 120 } },
      ]),
    );
    expect(moved.layout.positions.user).toEqual({ x: 10, y: 20 });
    expect(moved.layout.positions.db).toEqual({ x: 1010, y: 120 });
    const removed = edited(removeNodes(document, ['region', 'api', 'db']));
    expect(removed.graph.nodes.map((node) => node.id)).toEqual(['user']);
    expect(removed.graph.edges).toEqual([]);
  });
});

describe('updateDiagram', () => {
  it('renames the diagram and changes its cloud, and ignores what changes nothing', () => {
    const next = edited(updateDiagram(document, { title: '  Mine  ', provider: 'gcp' }));
    expect(next.graph).toMatchObject({ title: 'Mine', provider: 'gcp' });
    expect(updateDiagram(document, { title: 'Test', provider: 'aws' })).toMatchObject({
      ok: true,
      document,
    });
  });
});

describe('text fixed to a box', () => {
  /** Centre of a node's box. */
  const centreOf = (doc: DiagramDocument, id: string) => {
    const box = absoluteBoxes(doc.graph, doc.layout).get(id)!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const withText = () =>
    edited(addNode(document, 'text', centreOf(document, 'db'), { exact: true, name: 'Note' }));

  it('is fixed to the box it is put over, in its group, and not to what is in the open', () => {
    const next = withText();
    expect(nodeOf(next, 'text')).toMatchObject({ attachedTo: 'db', label: 'Note' });
    const free = edited(addNode(document, 'text', { x: 700, y: 900 }, { exact: true }));
    expect(nodeOf(free, 'text')?.attachedTo).toBeUndefined();
    const inGroup = edited(addNode(document, 'text', centreOf(document, 'api'), { exact: true }));
    expect(nodeOf(inGroup, 'text')).toMatchObject({ attachedTo: 'api', parentId: 'subnet' });
  });

  it('moves, is deleted and is copied with its box', () => {
    const next = withText();
    const before = absoluteBoxes(next.graph, next.layout).get('text')!;
    const moved = edited(moveNode(next, 'db', { x: 1100, y: 160 }));
    const after = absoluteBoxes(moved.graph, moved.layout).get('text')!;
    expect({ x: after.x - before.x, y: after.y - before.y }).toEqual({ x: 100, y: 60 });
    expect(
      moveNodes(next, [
        { id: 'db', position: { x: 1100, y: 160 } },
        { id: 'text', position: { x: 0, y: 0 } },
      ]),
    ).toMatchObject({ ok: true });
    const removed = edited(remove(next, { type: 'node', id: 'db' }));
    expect(removed.graph.nodes.some((node) => node.id === 'text')).toBe(false);
    const copied = edited(duplicate(next, 'db'));
    const copy = copied.graph.nodes.find((node) => node.kind === 'text' && node.id !== 'text');
    expect(copy?.attachedTo).toBe(
      copied.graph.nodes.find((node) => node.id.startsWith('db') && node.id !== 'db')?.id,
    );
  });

  it('is set free, and fixed again by putting it over a box', () => {
    const next = withText();
    const free = edited(updateNode(next, 'text', { attachedTo: undefined }));
    expect(nodeOf(free, 'text')?.attachedTo).toBeUndefined();
    const away = edited(moveNode(free, 'text', { x: 700, y: 900 }));
    expect(nodeOf(away, 'text')?.attachedTo).toBeUndefined();
    const back = absoluteBoxes(away.graph, away.layout).get('db')!;
    const over = edited(moveNode(away, 'text', { x: back.x + 20, y: back.y + 10 }));
    expect(nodeOf(over, 'text')?.attachedTo).toBe('db');
  });

  it('stays with its box in the stacking order', () => {
    const next = withText();
    const stacked = edited(stackNode(next, 'db', 'back'));
    const ids = stacked.graph.nodes
      .filter((node) => node.parentId === undefined)
      .map((node) => node.id);
    expect(ids.indexOf('text')).toBe(ids.indexOf('db') + 1);
    expect(stackNode(next, 'text', 'front')).toMatchObject({ ok: true, document: next });
  });
});

describe('edge styles', () => {
  const square = edited(setDefaultEdgeStyle(document, 'square'));

  it('sets the style of the diagram, and stores the default one as nothing', () => {
    expect(square.layout.edgeStyle).toBe('square');
    const back = edited(setDefaultEdgeStyle(square, 'curved'));
    expect(back.layout).toEqual(document.layout);
    expect(back.layout).not.toHaveProperty('edgeStyle');
  });

  it('changes nothing when the diagram already has that style', () => {
    expect(setDefaultEdgeStyle(document, 'curved')).toEqual({ ok: true, document });
    expect(setDefaultEdgeStyle(square, 'square')).toEqual({ ok: true, document: square });
  });

  it('gives one connection a style of its own, and takes it back', () => {
    const own = edited(setEdgeStyle(document, 'api-db', 'square'));
    expect(own.layout.edgeStyles).toEqual({ 'api-db': 'square' });
    expect(own.layout).not.toHaveProperty('edgeStyle');
    const followed = edited(setEdgeStyle(own, 'api-db', undefined));
    expect(followed.layout).toEqual(document.layout);
    expect(followed.layout).not.toHaveProperty('edgeStyles');
  });

  it('keeps the style of a connection when the diagram changes style', () => {
    const own = edited(setEdgeStyle(document, 'api-db', 'curved'));
    expect(edited(setDefaultEdgeStyle(own, 'square')).layout.edgeStyles).toEqual({
      'api-db': 'curved',
    });
  });

  it('changes nothing for a connection that does not exist or has that style already', () => {
    expect(setEdgeStyle(document, 'ghost', 'square')).toEqual({ ok: true, document });
    expect(setEdgeStyle(document, 'api-db', undefined)).toEqual({ ok: true, document });
    const own = edited(setEdgeStyle(document, 'api-db', 'square'));
    expect(setEdgeStyle(own, 'api-db', 'square')).toEqual({ ok: true, document: own });
  });

  it('survive the other edits of the layout', () => {
    const styled = edited(setEdgeStyle(square, 'api-db', 'curved'));
    const kept = { edgeStyle: 'square', edgeStyles: { 'api-db': 'curved' } };
    expect(edited(addNode(styled, 'cache', { x: 100, y: 600 })).layout).toMatchObject(kept);
    expect(edited(moveNode(styled, 'api', { x: 80, y: 90 })).layout).toMatchObject(kept);
    expect(
      edited(resizeNode(styled, 'db', { x: 1000, y: 100, width: 240, height: 100 })).layout,
    ).toMatchObject(kept);
    expect(edited(duplicate(styled, 'db')).layout).toMatchObject(kept);
    expect(edited(remove(styled, { type: 'node', id: 'user' })).layout).toMatchObject(kept);
  });

  it('are forgotten with the connection, whether it is removed alone or with a component', () => {
    const both = edited(
      setEdgeStyle(edited(setEdgeStyle(document, 'api-db', 'square')), 'user-api', 'square'),
    );
    expect(edited(remove(both, { type: 'edge', id: 'api-db' })).layout.edgeStyles).toEqual({
      'user-api': 'square',
    });
    expect(edited(remove(both, { type: 'node', id: 'db' })).layout.edgeStyles).toEqual({
      'user-api': 'square',
    });
    expect(edited(remove(both, { type: 'node', id: 'vpc' })).layout).not.toHaveProperty(
      'edgeStyles',
    );
  });

  it('are copied with the connections that are copied with a group', () => {
    const withInner: DiagramDocument = {
      graph: {
        ...graph,
        nodes: [
          ...graph.nodes,
          { id: 'worker', kind: 'service', label: 'Worker', parentId: 'vpc' },
        ],
        edges: [...graph.edges, { id: 'api-worker', source: 'api', target: 'worker' }],
      },
      layout: {
        positions: { ...document.layout.positions, worker: { x: 340, y: 48 } },
        sizes: { ...document.layout.sizes, worker: DEFAULT_NODE_SIZE },
        edgeStyles: { 'api-worker': 'square', 'api-db': 'square' },
      },
    };
    const next = edited(duplicate(withInner, 'vpc'));
    expect(next.layout.edgeStyles).toEqual({
      'api-worker': 'square',
      'api-db': 'square',
      'api-2-worker-2': 'square',
    });
  });
});
