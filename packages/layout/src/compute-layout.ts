import {
  type ArchitectureGraph,
  type ArchNode,
  type DiagramLayout,
  type GraphIndex,
  indexGraph,
  isContainer,
  type Point,
  type Size,
} from '@archdraft/core';
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

export const DEFAULT_NODE_SIZE: Size = { width: 180, height: 64 };
export const DEFAULT_CONTAINER_SIZE: Size = { width: 240, height: 140 };

/** Space between sibling nodes, also kept around new nodes in pinned mode. */
export const NODE_SPACING = 40;
const LAYER_SPACING = 80;
/** Room for the container title above its children. */
export const CONTAINER_PADDING = { top: 48, right: 24, bottom: 24, left: 24 } as const;

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
  if (!pinned || !graph.nodes.some((node) => pinned.positions[node.id] !== undefined)) {
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
    const size =
      knownSizes[node.id] ?? (isContainer(node) ? DEFAULT_CONTAINER_SIZE : DEFAULT_NODE_SIZE);
    return { id: node.id, ...size };
  };

  const children = index.roots.map(toElkNode);
  const edges: ElkExtendedEdge[] = [];
  for (const edge of index.edgesById.values()) {
    if (included.has(edge.source) && included.has(edge.target)) {
      edges.push({ id: edge.id, sources: [edge.source], targets: [edge.target] });
    }
  }

  const result = await elk.layout({
    id: '__root__',
    children,
    edges,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIRECTIONS[direction],
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': String(NODE_SPACING),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_SPACING),
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.randomSeed': '1',
      'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    },
  });

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
 * Keeps pinned nodes where they are and moves each new node from its fresh
 * ELK position along the cross axis until it clears its siblings. Containers
 * grow to fit their children but never shrink. Children are settled before
 * their container so that its final size is known when it is placed.
 */
function mergePinned(
  index: GraphIndex,
  fresh: DiagramLayout,
  pinned: DiagramLayout,
  direction: LayoutDirection,
): DiagramLayout {
  const layout: DiagramLayout = { positions: {}, sizes: {} };
  const crossAxisIsY = direction === 'LR' || direction === 'RL';

  const sizeOf = (id: string): Size =>
    layout.sizes[id] ?? pinned.sizes[id] ?? fresh.sizes[id] ?? DEFAULT_NODE_SIZE;

  const settle = (siblings: readonly ArchNode[]): void => {
    for (const node of siblings) {
      const children = index.childrenOf.get(node.id) ?? [];
      settle(children);
      layout.sizes[node.id] = grow(sizeOf(node.id), children);
    }

    const placed: Box[] = [];
    for (const node of siblings) {
      const position = pinned.positions[node.id];
      if (position) {
        layout.positions[node.id] = { ...position };
        placed.push({ ...position, ...sizeOf(node.id) });
      }
    }
    for (const node of siblings) {
      if (layout.positions[node.id]) continue;
      const box: Box = { ...(fresh.positions[node.id] ?? { x: 0, y: 0 }), ...sizeOf(node.id) };
      for (let hit = placed.find((other) => overlaps(box, other)); hit;) {
        if (crossAxisIsY) box.y = hit.y + hit.height + NODE_SPACING;
        else box.x = hit.x + hit.width + NODE_SPACING;
        hit = placed.find((other) => overlaps(box, other));
      }
      layout.positions[node.id] = { x: box.x, y: box.y };
      placed.push(box);
    }
  };

  const grow = (size: Size, children: readonly ArchNode[]): Size => {
    let { width, height } = size;
    for (const child of children) {
      const position = layout.positions[child.id] ?? { x: 0, y: 0 };
      const childSize = sizeOf(child.id);
      width = Math.max(width, position.x + childSize.width + CONTAINER_PADDING.right);
      height = Math.max(height, position.y + childSize.height + CONTAINER_PADDING.bottom);
    }
    return { width, height };
  };

  settle(index.roots);
  return layout;
}
