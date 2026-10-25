import {
  ARCHITECTURE_TEMPLATES,
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  CONTAINER_PADDING,
  DEFAULT_CONTAINER_SIZE,
  DEFAULT_NODE_SIZE,
  type DiagramLayout,
  DiagramLayoutSchema,
  indexGraph,
  layoutEntry,
  TEMPLATE_IDS,
  validateGraph,
} from '@archdraft/core';
import { describe, expect, it } from 'vitest';
import { computeLayout } from '../src/index.ts';

function graphOf(nodes: ArchNode[], edges: ArchEdge[] = []): ArchitectureGraph {
  return { schemaVersion: 1, title: 'Test', provider: 'aws', nodes, edges };
}

/** Customer to a load balancer and API in nested containers, with a database and a queue. */
function nestedGraph(): ArchitectureGraph {
  return graphOf(
    [
      { id: 'customer', kind: 'user', label: 'Customer' },
      { id: 'region', kind: 'region', label: 'Region' },
      { id: 'vpc', kind: 'network', label: 'VPC', parentId: 'region' },
      { id: 'public', kind: 'subnet', label: 'Public', parentId: 'vpc' },
      { id: 'private', kind: 'subnet', label: 'Private', parentId: 'vpc' },
      { id: 'alb', kind: 'load-balancer', label: 'ALB', parentId: 'public' },
      { id: 'api', kind: 'service', label: 'API', parentId: 'private' },
      { id: 'db', kind: 'relational-db', label: 'DB', parentId: 'private' },
      { id: 'queue', kind: 'queue', label: 'Queue', parentId: 'region' },
      { id: 'empty', kind: 'boundary', label: 'Empty boundary' },
    ],
    [
      { id: 'e1', source: 'customer', target: 'alb' },
      { id: 'e2', source: 'alb', target: 'api' },
      { id: 'e3', source: 'api', target: 'db' },
      { id: 'e4', source: 'api', target: 'queue' },
    ],
  );
}

function chainGraph(length: number): ArchitectureGraph {
  const nodes = Array.from({ length }, (_, i): ArchNode => ({
    id: `n${i}`,
    kind: 'service',
    label: `Node ${i}`,
  }));
  const edges = nodes
    .slice(1)
    .map((node, i): ArchEdge => ({ id: `e${i}`, source: `n${i}`, target: node.id }));
  return graphOf(nodes, edges);
}

/** 200 nodes: 20 networks with 9 services each, chained inside and across networks. */
function largeGraph(): ArchitectureGraph {
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  for (let n = 0; n < 20; n++) {
    nodes.push({ id: `net${n}`, kind: 'network', label: `Network ${n}` });
    for (let s = 0; s < 9; s++) {
      nodes.push({ id: `s${n}-${s}`, kind: 'service', label: `Service ${s}`, parentId: `net${n}` });
      if (s > 0) edges.push({ id: `e${n}-${s}`, source: `s${n}-${s - 1}`, target: `s${n}-${s}` });
    }
    if (n > 0) edges.push({ id: `x${n}`, source: `s${n - 1}-8`, target: `s${n}-0` });
  }
  return graphOf(nodes, edges);
}

function boxOf(layout: DiagramLayout, id: string) {
  const position = layout.positions[id];
  const size = layout.sizes[id];
  if (!position || !size) throw new Error(`No layout for ${id}`);
  return { ...position, ...size };
}

function intersects(a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Fails with the offending ids so that a regression is easy to read. */
function expectReadable(graph: ArchitectureGraph, layout: DiagramLayout): void {
  const index = indexGraph(graph);
  const groups = [index.roots, ...index.childrenOf.values()];
  const overlapping: string[] = [];
  for (const siblings of groups) {
    for (const [i, a] of siblings.entries()) {
      for (const b of siblings.slice(i + 1)) {
        if (intersects(boxOf(layout, a.id), boxOf(layout, b.id)))
          overlapping.push(`${a.id}/${b.id}`);
      }
    }
  }
  expect(overlapping).toEqual([]);

  const outside: string[] = [];
  for (const [parentId, children] of index.childrenOf) {
    const parent = boxOf(layout, parentId);
    for (const child of children) {
      const box = boxOf(layout, child.id);
      if (
        box.x < 0 ||
        box.y < 0 ||
        box.x + box.width > parent.width ||
        box.y + box.height > parent.height
      ) {
        outside.push(child.id);
      }
    }
  }
  expect(outside).toEqual([]);
}

describe('computeLayout', () => {
  it('returns an empty layout for an empty graph', async () => {
    expect(await computeLayout(graphOf([]))).toEqual({ positions: {}, sizes: {} });
  });

  it('places and sizes every node and returns a valid layout', async () => {
    const graph = nestedGraph();
    const layout = await computeLayout(graph);
    expect(Object.keys(layout.positions).sort()).toEqual(graph.nodes.map((n) => n.id).sort());
    expect(Object.keys(layout.sizes).sort()).toEqual(graph.nodes.map((n) => n.id).sort());
    expect(DiagramLayoutSchema.safeParse(layout).success).toBe(true);
  });

  it('uses default sizes for leaves and empty containers', async () => {
    const layout = await computeLayout(nestedGraph());
    expect(layout.sizes.api).toEqual(DEFAULT_NODE_SIZE);
    expect(layout.sizes.empty).toEqual(DEFAULT_CONTAINER_SIZE);
  });

  it('uses known sizes from the pinned layout without pinning positions', async () => {
    const layout = await computeLayout(nestedGraph(), {
      pinned: { positions: {}, sizes: { api: { width: 300, height: 90 } } },
    });
    expect(layout.sizes.api).toEqual({ width: 300, height: 90 });
    expectReadable(nestedGraph(), layout);
  });

  it('keeps siblings apart and children inside nested containers', async () => {
    const graph = nestedGraph();
    expectReadable(graph, await computeLayout(graph));
  });

  it('leaves room for the container header', async () => {
    const layout = await computeLayout(nestedGraph());
    for (const child of ['vpc', 'queue', 'public', 'private', 'alb', 'api', 'db']) {
      expect(boxOf(layout, child).y).toBeGreaterThanOrEqual(CONTAINER_PADDING.top);
    }
  });

  it('is deterministic', async () => {
    const graph = nestedGraph();
    expect(await computeLayout(graph)).toEqual(await computeLayout(graph));
  });

  it('does not modify its inputs', async () => {
    const graph = nestedGraph();
    const pinned: DiagramLayout = { positions: { api: { x: 1, y: 2 } }, sizes: {} };
    const before = structuredClone({ graph, pinned });
    await computeLayout(graph, { pinned });
    expect({ graph, pinned }).toEqual(before);
  });

  it.each([
    ['LR', 'x', 1],
    ['RL', 'x', -1],
    ['TB', 'y', 1],
    ['BT', 'y', -1],
  ] as const)('follows the %s direction', async (direction, axis, sign) => {
    const layout = await computeLayout(chainGraph(3), { direction });
    const [a, b, c] = ['n0', 'n1', 'n2'].map((id) => boxOf(layout, id)[axis] * sign);
    expect(a).toBeLessThan(b ?? 0);
    expect(b).toBeLessThan(c ?? 0);
  });

  it('skips edges to unknown nodes and nodes in a parent cycle', async () => {
    const graph = graphOf(
      [
        { id: 'a', kind: 'service', label: 'A' },
        { id: 'x', kind: 'boundary', label: 'X', parentId: 'y' },
        { id: 'y', kind: 'boundary', label: 'Y', parentId: 'x' },
      ],
      [
        { id: 'e1', source: 'a', target: 'missing' },
        { id: 'e2', source: 'a', target: 'x' },
      ],
    );
    expect(validateGraph(graph).length).toBeGreaterThan(0);
    const layout = await computeLayout(graph);
    expect(Object.keys(layout.positions)).toEqual(['a']);
  });

  it('lays out 200 nested nodes quickly and readably', async () => {
    const graph = largeGraph();
    expect(graph.nodes).toHaveLength(200);
    expect(validateGraph(graph)).toEqual([]);
    const start = performance.now();
    const layout = await computeLayout(graph);
    expect(performance.now() - start).toBeLessThan(2000);
    expectReadable(graph, layout);
  });
});

describe('computeLayout with pinned positions', () => {
  it('keeps pinned nodes and places new ones clear of their siblings', async () => {
    const graph = nestedGraph();
    const previous = await computeLayout(graph);
    const extended = graphOf(
      [
        ...graph.nodes,
        { id: 'cache', kind: 'cache', label: 'Cache', parentId: 'private' },
        { id: 'admin', kind: 'user', label: 'Admin' },
      ],
      [...graph.edges, { id: 'e5', source: 'api', target: 'cache' }],
    );

    const layout = await computeLayout(extended, { pinned: previous });

    for (const node of graph.nodes) {
      expect(layout.positions[node.id]).toEqual(previous.positions[node.id]);
    }
    expect(layout.positions.cache).toBeDefined();
    expect(layout.positions.admin).toBeDefined();
    expectReadable(extended, layout);
  });

  it('moves a new node off a pinned sibling along the cross axis', async () => {
    const graph = graphOf([
      { id: 'a', kind: 'service', label: 'A' },
      { id: 'b', kind: 'service', label: 'B' },
    ]);
    const fresh = await computeLayout(graph);
    const pinnedAt = fresh.positions.b ?? { x: 0, y: 0 };

    const horizontal = await computeLayout(graph, {
      pinned: { positions: { a: pinnedAt }, sizes: {} },
    });
    expect(horizontal.positions.a).toEqual(pinnedAt);
    expect(horizontal.positions.b?.x).toBe(pinnedAt.x);
    expect(horizontal.positions.b?.y).toBeGreaterThanOrEqual(pinnedAt.y + DEFAULT_NODE_SIZE.height);

    const freshVertical = await computeLayout(graph, { direction: 'TB' });
    const pinnedVertical = freshVertical.positions.b ?? { x: 0, y: 0 };
    const vertical = await computeLayout(graph, {
      direction: 'TB',
      pinned: { positions: { a: pinnedVertical }, sizes: {} },
    });
    expect(vertical.positions.b?.y).toBe(pinnedVertical.y);
    expect(vertical.positions.b?.x).toBeGreaterThanOrEqual(
      pinnedVertical.x + DEFAULT_NODE_SIZE.width,
    );
    expectReadable(graph, vertical);
  });

  it('keeps a pinned size and grows a container to fit a new child', async () => {
    const graph = graphOf([
      { id: 'net', kind: 'network', label: 'Net' },
      { id: 'a', kind: 'service', label: 'A', parentId: 'net' },
      { id: 'b', kind: 'service', label: 'B', parentId: 'net' },
    ]);
    const pinned: DiagramLayout = {
      positions: { net: { x: 0, y: 0 }, a: { x: 24, y: 48 } },
      sizes: { net: { width: 228, height: 136 }, a: { width: 180, height: 64 } },
    };

    const layout = await computeLayout(graph, { pinned });

    expect(layout.sizes.a).toEqual({ width: 180, height: 64 });
    expect(layout.positions.net).toEqual({ x: 0, y: 0 });
    const net = boxOf(layout, 'net');
    expect(net.width).toBeGreaterThanOrEqual(228);
    expect(net.height).toBeGreaterThanOrEqual(136);
    expect(net.width * net.height).toBeGreaterThan(228 * 136);
    expectReadable(graph, layout);
  });

  it('never shrinks a pinned container', async () => {
    const graph = graphOf([{ id: 'net', kind: 'network', label: 'Net' }]);
    const big = { width: 900, height: 700 };
    const layout = await computeLayout(graph, {
      pinned: { positions: { net: { x: 5, y: 5 } }, sizes: { net: big } },
    });
    expect(layout).toEqual({ positions: { net: { x: 5, y: 5 } }, sizes: { net: big } });
  });

  it('ignores pinned entries for nodes that no longer exist', async () => {
    const graph = chainGraph(2);
    const layout = await computeLayout(graph, {
      pinned: { positions: { gone: { x: 0, y: 0 } }, sizes: {} },
    });
    expect(layout).toEqual(await computeLayout(graph));
  });
});

describe('computeLayout with ids that match object members', () => {
  const graph = graphOf(
    [
      { id: 'constructor', kind: 'service', label: 'A' },
      { id: 'toString', kind: 'service', label: 'B' },
    ],
    [{ id: 'e1', source: 'constructor', target: 'toString' }],
  );

  it('does not read inherited members as sizes', async () => {
    const layout = await computeLayout(graph, { pinned: { positions: {}, sizes: {} } });
    expect(layoutEntry(layout.sizes, 'constructor')).toEqual(DEFAULT_NODE_SIZE);
    expect(DiagramLayoutSchema.safeParse(layout).success).toBe(true);
  });

  it('does not read inherited members as pinned positions', async () => {
    const layout = await computeLayout(graph, {
      pinned: { positions: { toString: { x: 0, y: 0 } }, sizes: {} },
    });
    expect(layoutEntry(layout.positions, 'toString')).toEqual({ x: 0, y: 0 });
    expect(DiagramLayoutSchema.safeParse(layout).success).toBe(true);
    expectReadable(graph, layout);
  });
});

describe('computeLayout with the architecture templates', () => {
  it.each(TEMPLATE_IDS)('lays out %s without overlaps', async (id) => {
    const graph = ARCHITECTURE_TEMPLATES[id];
    expectReadable(graph, await computeLayout(graph));
  });
});
