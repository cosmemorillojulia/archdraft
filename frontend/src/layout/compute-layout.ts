import {
  type ArchitectureGraph,
  type ArchNode,
  CONTAINER_PADDING,
  DEFAULT_NODE_SIZE,
  defaultSizeOf,
  type DiagramLayout,
  type GraphIndex,
  indexGraph,
  layoutEntry,
  type Point,
  type Size,
} from '@archdraft/shared';
import ELK, {
  type ElkExtendedEdge,
  type ElkNode,
  type LayoutOptions,
} from 'elkjs/lib/elk.bundled.js';

export const LAYOUT_DIRECTIONS = ['LR', 'TB', 'RL', 'BT'] as const;
export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number];

export interface ComputeLayoutOptions {
  /** Main flow direction, with the same values as `toMermaid`. Defaults to `LR`. */
  readonly direction?: LayoutDirection;
  /**
   * A previous layout to preserve. Nodes with a position here keep it, and
   * their size if one is given; only the remaining nodes are placed. Sizes
   * without a position are used as the measured size of the node.
   */
  readonly pinned?: DiagramLayout;
}

/** Space between sibling nodes, also kept around new nodes in pinned mode. */
export const NODE_SPACING = 40;
const LAYER_SPACING = 80;
const EDGE_SPACING = 24;
/** Passes ELK makes to reduce crossings; its default is 7. */
const THOROUGHNESS = 16;
/** Places tried on each side of the best one for a new node, before it goes past all the others. */
const MAX_TRIES = 24;

/**
 * The two ways ELK can place nodes across the flow, both tried on every diagram: network
 * simplex lines up chains of calls, so their connections run straight; balanced Brandes-Köpf
 * centres a node between the ones it fans out to or gathers from.
 */
const PLACEMENTS: readonly LayoutOptions[] = [
  { 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX' },
  {
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
  },
];
/** What a connection that has to step across the flow costs, against a pixel off centre. */
const STEP_COST = 30;

const ELK_DIRECTIONS: Record<LayoutDirection, string> = {
  LR: 'RIGHT',
  TB: 'DOWN',
  RL: 'LEFT',
  BT: 'UP',
};

const CONTAINER_OPTIONS: LayoutOptions = {
  'elk.padding': `[top=${CONTAINER_PADDING.top},left=${CONTAINER_PADDING.left},bottom=${CONTAINER_PADDING.bottom},right=${CONTAINER_PADDING.right}]`,
};

const elk = new ELK();

/**
 * Computes a readable layout with ELK `layered`. Containers are laid out
 * together with their contents (`INCLUDE_CHILDREN`), so edges that cross
 * container borders still shape the layering. The result is deterministic
 * for the same graph and options.
 *
 * The graph is expected to be valid. Nodes caught in a parent cycle and edges
 * to unknown nodes are left out instead of making ELK fail.
 */
export async function computeLayout(
  graph: ArchitectureGraph,
  options: ComputeLayoutOptions = {},
): Promise<DiagramLayout> {
  const { direction = 'LR', pinned } = options;
  const index = indexGraph(graph);
  const fresh = await runElk(index, direction, pinned?.sizes ?? {});
  if (
    !pinned ||
    !graph.nodes.some((node) => layoutEntry(pinned.positions, node.id) !== undefined)
  ) {
    return fresh;
  }
  return mergePinned(index, fresh, pinned, direction);
}

async function runElk(
  index: GraphIndex,
  direction: LayoutDirection,
  knownSizes: DiagramLayout['sizes'],
): Promise<DiagramLayout> {
  const included = new Set<string>();

  const toElkNode = (node: ArchNode): ElkNode => {
    included.add(node.id);
    const children = (index.childrenOf.get(node.id) ?? []).map(toElkNode);
    if (children.length > 0) return { id: node.id, children, layoutOptions: CONTAINER_OPTIONS };
    const size = layoutEntry(knownSizes, node.id) ?? defaultSizeOf(node.kind);
    return { id: node.id, ...size };
  };

  /** A graph of its own for each run: ELK writes the positions into the one it is given. */
  const elkGraph = (placement: LayoutOptions): ElkNode => {
    included.clear();
    const children = index.roots.map(toElkNode);
    const edges: ElkExtendedEdge[] = [];
    for (const edge of index.edgesById.values()) {
      if (included.has(edge.source) && included.has(edge.target)) {
        edges.push({ id: edge.id, sources: [edge.source], targets: [edge.target] });
      }
    }
    return { id: '__root__', children, edges, layoutOptions: elkOptions(direction, placement) };
  };

  let best: DiagramLayout | undefined;
  let bestScore = Infinity;
  for (const placement of PLACEMENTS) {
    const layout = collected(await elk.layout(elkGraph(placement)));
    const score = untidiness(index, layout, direction);
    if (score < bestScore) {
      best = layout;
      bestScore = score;
    }
  }
  return best ?? { positions: {}, sizes: {} };
}

function elkOptions(direction: LayoutDirection, placement: LayoutOptions): LayoutOptions {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': ELK_DIRECTIONS[direction],
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.spacing.nodeNode': String(NODE_SPACING),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_SPACING),
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    // Fewer crossings and straighter lines: more passes to untangle each layer, the swaps that
    // ELK leaves off for nested diagrams, and nodes lined up with what they connect to.
    'elk.layered.thoroughness': String(THOROUGHNESS),
    'elk.layered.crossingMinimization.greedySwitchHierarchical.type': 'TWO_SIDED',
    // Room for the connections, which the canvas draws itself, to pass between the boxes.
    'elk.spacing.edgeNode': String(EDGE_SPACING),
    'elk.spacing.edgeEdge': String(EDGE_SPACING / 2),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(EDGE_SPACING),
    'elk.randomSeed': '1',
    'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    ...placement,
  };
}

function collected(result: ElkNode): DiagramLayout {
  const layout: DiagramLayout = { positions: {}, sizes: {} };
  const collect = (nodes: readonly ElkNode[] | undefined): void => {
    for (const node of nodes ?? []) {
      layout.positions[node.id] = { x: Math.round(node.x ?? 0), y: Math.round(node.y ?? 0) };
      layout.sizes[node.id] = {
        width: Math.round(node.width ?? DEFAULT_NODE_SIZE.width),
        height: Math.round(node.height ?? DEFAULT_NODE_SIZE.height),
      };
      collect(node.children);
    }
  };
  collect(result.children);
  return layout;
}

/**
 * How untidy a layout looks across the flow: each connection whose ends are not level costs
 * `STEP_COST`, and each node that calls, or is called by, several others costs how far it is
 * from the middle of them. Lower is tidier.
 */
function untidiness(index: GraphIndex, layout: DiagramLayout, direction: LayoutDirection): number {
  const across = direction === 'LR' || direction === 'RL' ? 'y' : 'x';
  const breadth = across === 'y' ? 'height' : 'width';
  const starts = new Map<string, number>();
  /** Where the node starts across the flow on the whole diagram; positions are parent relative. */
  const startOf = (id: string | undefined): number => {
    if (id === undefined) return 0;
    const known = starts.get(id);
    if (known !== undefined) return known;
    // Nodes in a cycle of parents are left out of the layout; this keeps them from recursing.
    starts.set(id, 0);
    const start =
      (layoutEntry(layout.positions, id)?.[across] ?? 0) +
      startOf(index.nodesById.get(id)?.parentId);
    starts.set(id, start);
    return start;
  };
  const centreOf = (id: string) =>
    startOf(id) + (layoutEntry(layout.sizes, id)?.[breadth] ?? 0) / 2;

  let score = 0;
  for (const edge of index.edgesById.values()) {
    if (Math.abs(centreOf(edge.source) - centreOf(edge.target)) > 1) score += STEP_COST;
  }
  for (const id of index.nodesById.keys()) {
    for (const ends of [
      (index.outgoing.get(id) ?? []).map((edge) => centreOf(edge.target)),
      (index.incoming.get(id) ?? []).map((edge) => centreOf(edge.source)),
    ]) {
      if (ends.length < 2) continue;
      const middle = ends.reduce((sum, end) => sum + end, 0) / ends.length;
      score += Math.abs(centreOf(id) - middle);
    }
  }
  return score;
}

interface Box extends Point, Size {}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width + NODE_SPACING &&
    b.x < a.x + a.width + NODE_SPACING &&
    a.y < b.y + b.height + NODE_SPACING &&
    b.y < a.y + a.height + NODE_SPACING
  );
}

/**
 * Keeps pinned nodes where they are and places each new node beside what it
 * connects to: after the nodes that call it and before those it calls, along
 * the flow, level with them across it. From there it takes the nearest place
 * on either side that clears its siblings, so a change stays next to the part
 * of the diagram it touches instead of at its edge. A new node connected to
 * nothing placed starts from its fresh ELK position. Containers grow to fit
 * their children but never shrink. Children are settled before their
 * container so that its final size is known when it is placed.
 */
function mergePinned(
  index: GraphIndex,
  fresh: DiagramLayout,
  pinned: DiagramLayout,
  direction: LayoutDirection,
): DiagramLayout {
  const layout: DiagramLayout = { positions: {}, sizes: {} };
  const crossAxisIsY = direction === 'LR' || direction === 'RL';
  const main = crossAxisIsY ? 'x' : 'y';
  const cross = crossAxisIsY ? 'y' : 'x';
  const length = crossAxisIsY ? 'width' : 'height';
  const breadth = crossAxisIsY ? 'height' : 'width';
  /** Whether the flow runs towards smaller coordinates. */
  const backwards = direction === 'RL' || direction === 'BT';

  const sizeOf = (id: string): Size =>
    layoutEntry(layout.sizes, id) ??
    layoutEntry(pinned.sizes, id) ??
    layoutEntry(fresh.sizes, id) ??
    DEFAULT_NODE_SIZE;

  /** Where a pinned node is on the whole diagram, if it and every group around it are pinned. */
  const pinnedOrigin = (id: string | undefined): Point | undefined => {
    if (id === undefined) return { x: 0, y: 0 };
    const position = layoutEntry(pinned.positions, id);
    const parent = pinnedOrigin(index.nodesById.get(id)?.parentId);
    return position && parent ? { x: parent.x + position.x, y: parent.y + position.y } : undefined;
  };

  /** Edges of `node`, each with the node at its other end and whether that one calls it. */
  const neighbours = (node: ArchNode) => [
    ...(index.incoming.get(node.id) ?? []).map((edge) => ({ id: edge.source, calls: true })),
    ...(index.outgoing.get(node.id) ?? []).map((edge) => ({ id: edge.target, calls: false })),
  ];

  /**
   * Where `node` would sit best in the group `parentId`, beside the nodes it
   * connects to that already have a place: its siblings placed so far, or
   * pinned nodes anywhere, whose position is brought into the group.
   */
  const besideNeighbours = (
    node: ArchNode,
    size: Size,
    placedHere: ReadonlyMap<string, Box>,
  ): Point | undefined => {
    const origin = pinnedOrigin(node.parentId);
    const boxes = neighbours(node).flatMap(({ id, calls }) => {
      const sibling = placedHere.get(id);
      if (sibling) return [{ box: sibling, calls }];
      const at = origin ? pinnedOrigin(id) : undefined;
      if (!at || !origin) return [];
      return [{ box: { x: at.x - origin.x, y: at.y - origin.y, ...sizeOf(id) }, calls }];
    });
    if (boxes.length === 0) return undefined;
    const step = (box: Box, calls: boolean) =>
      calls !== backwards
        ? box[main] + box[length] + LAYER_SPACING
        : box[main] - size[length] - LAYER_SPACING;
    const callers = boxes.filter(({ calls }) => calls);
    const along = (callers.length > 0 ? callers : boxes).map(({ box, calls }) => step(box, calls));
    const centre = boxes.reduce((sum, { box }) => sum + box[cross] + box[breadth] / 2, 0);
    return {
      [main]: backwards !== callers.length > 0 ? Math.max(...along) : Math.min(...along),
      [cross]: centre / boxes.length - size[breadth] / 2,
    } as unknown as Point;
  };

  /**
   * Moves `box` across the flow to the nearest place, on either side, clear of
   * `placed`; within `room`, the size of its group, if there is such a place.
   */
  const clear = (box: Box, placed: readonly Box[], least: Point, room: Size | undefined): void => {
    const end = (axis: 'width' | 'height') =>
      (room?.[axis] ?? Infinity) -
      (axis === 'width' ? CONTAINER_PADDING.right : CONTAINER_PADDING.bottom);
    // A group that has to grow grows across the flow, away from the groups next to it along it.
    box[main] = Math.max(Math.min(box[main], end(length) - box[length]), least[main]);
    const start = box[cross];
    const gap = (box[breadth] + NODE_SPACING) / 2;
    let first: number | undefined;
    for (let tries = 0; tries <= MAX_TRIES * 2; tries++) {
      const offset = Math.ceil(tries / 2) * gap * (tries % 2 === 1 ? 1 : -1);
      box[cross] = start + offset;
      if (box[cross] < least[cross] || placed.some((other) => overlaps(box, other))) continue;
      if (box[cross] + box[breadth] <= end(breadth)) return;
      first ??= box[cross];
    }
    if (first !== undefined) {
      box[cross] = first;
      return;
    }
    // Nothing near is free: past all the others, as far as it takes.
    box[cross] = Math.max(start, least[cross]);
    for (let hit = placed.find((other) => overlaps(box, other)); hit;) {
      box[cross] = hit[cross] + hit[breadth] + NODE_SPACING;
      hit = placed.find((other) => overlaps(box, other));
    }
  };

  const settle = (siblings: readonly ArchNode[], group?: string): void => {
    for (const node of siblings) {
      const children = index.childrenOf.get(node.id) ?? [];
      settle(children, node.id);
      layout.sizes[node.id] = grow(sizeOf(node.id), children);
    }

    const placed = new Map<string, Box>();
    for (const node of siblings) {
      const position = layoutEntry(pinned.positions, node.id);
      if (position) {
        layout.positions[node.id] = { ...position };
        placed.set(node.id, { ...position, ...sizeOf(node.id) });
      }
    }
    // Inside a group, nothing goes above or left of its padding, which holds its name.
    const least =
      group === undefined
        ? { x: -Infinity, y: -Infinity }
        : { x: CONTAINER_PADDING.left, y: CONTAINER_PADDING.top };
    const room = group === undefined ? undefined : layoutEntry(pinned.sizes, group);
    for (const node of siblings) {
      if (layoutEntry(layout.positions, node.id)) continue;
      const size = sizeOf(node.id);
      const box: Box = {
        ...(besideNeighbours(node, size, placed) ??
          layoutEntry(fresh.positions, node.id) ?? { x: 0, y: 0 }),
        ...size,
      };
      box.x = Math.round(box.x);
      box.y = Math.round(box.y);
      clear(box, [...placed.values()], least, room);
      layout.positions[node.id] = { x: Math.round(box.x), y: Math.round(box.y) };
      placed.set(node.id, box);
    }
  };

  const grow = (size: Size, children: readonly ArchNode[]): Size => {
    let { width, height } = size;
    for (const child of children) {
      const position = layoutEntry(layout.positions, child.id) ?? { x: 0, y: 0 };
      const childSize = sizeOf(child.id);
      width = Math.max(width, position.x + childSize.width + CONTAINER_PADDING.right);
      height = Math.max(height, position.y + childSize.height + CONTAINER_PADDING.bottom);
    }
    return { width, height };
  };

  settle(index.roots);
  return layout;
}
