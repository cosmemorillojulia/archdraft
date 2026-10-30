import {
  type ArchitectureGraph,
  type ArchNode,
  type DiagramLayout,
  layoutEntry,
  type NodeSide,
} from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The nodes from back to front. The order of `graph.nodes` is the stacking
 * order among nodes of the same container; a container comes before its
 * children, and its whole contents stay together, so one sent to the front
 * takes them with it. Parents come first, which React Flow needs.
 */
export function stackingOrder(graph: ArchitectureGraph): ArchNode[] {
  const ids = new Set(graph.nodes.map((node) => node.id));
  const children = new Map<string | undefined, ArchNode[]>();
  for (const node of graph.nodes) {
    const parent =
      node.parentId !== undefined && ids.has(node.parentId) ? node.parentId : undefined;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  const ordered: ArchNode[] = [];
  const visit = (parent: string | undefined, seen: ReadonlySet<string>) => {
    for (const node of children.get(parent) ?? []) {
      if (seen.has(node.id)) continue;
      ordered.push(node);
      visit(node.id, new Set([...seen, node.id]));
    }
  };
  visit(undefined, new Set());
  return ordered;
}

/**
 * Boxes in diagram coordinates. Layout positions are relative to the parent
 * container, so each node adds the absolute position of its ancestors. Nodes
 * without a layout entry are left out, and so are their descendants.
 * Expects a valid graph: containers cannot nest in a cycle.
 */
export function absoluteBoxes(graph: ArchitectureGraph, layout: DiagramLayout): Map<string, Box> {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const boxes = new Map<string, Box>();

  const resolve = (id: string): Box | undefined => {
    const known = boxes.get(id);
    if (known) return known;
    const node = nodes.get(id);
    const position = layoutEntry(layout.positions, id);
    const size = layoutEntry(layout.sizes, id);
    if (!node || !position || !size) return undefined;

    const parent = node.parentId === undefined ? { x: 0, y: 0 } : resolve(node.parentId);
    if (!parent) return undefined;
    const box = { x: parent.x + position.x, y: parent.y + position.y, ...size };
    boxes.set(id, box);
    return box;
  };

  for (const node of graph.nodes) resolve(node.id);
  return boxes;
}

/**
 * How many containers enclose each node: 0 at the top level. Expects a valid
 * graph, where containers cannot nest in a cycle.
 */
export function nestingDepths(graph: ArchitectureGraph): Map<string, number> {
  const parents = new Map(graph.nodes.map((node) => [node.id, node.parentId]));
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    const parentId = parents.get(id);
    const depth = parentId === undefined ? 0 : depthOf(parentId) + 1;
    depths.set(id, depth);
    return depth;
  };
  for (const node of graph.nodes) depthOf(node.id);
  return depths;
}

/**
 * Scale at which a diagram of `content` size is drawn in a `viewport`: the
 * scale that fits it, raised to `min` so that text stays readable (the view
 * then scrolls) and capped at `max` so that small diagrams do not balloon.
 */
export function drawingScale(
  content: { width: number; height: number },
  viewport: { width: number; height: number },
  { min, max }: { min: number; max: number },
): number {
  const fit = Math.min(viewport.width / content.width, viewport.height / content.height);
  return Math.min(Math.max(fit, min), max);
}

/** Smallest box that contains all the given boxes, or null if there are none. */
export function boundsOf(boxes: Iterable<Box>): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Space taken by the floating interface on each side of the canvas, in pixels. */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * Viewport that shows `content` inside the part of the canvas not covered by
 * the floating interface: centred and fitted when it fits at a readable zoom,
 * otherwise at the `min` zoom, centred horizontally and starting at the top,
 * where a top-to-bottom flow begins.
 */
export function initialViewport(
  content: Box,
  canvas: { width: number; height: number },
  insets: Insets,
  limits: { min: number; max: number },
): Viewport {
  const available = {
    width: Math.max(canvas.width - insets.left - insets.right, 1),
    height: Math.max(canvas.height - insets.top - insets.bottom, 1),
  };
  const zoom = drawingScale(content, available, limits);
  const spareHeight = available.height - content.height * zoom;
  return {
    x: insets.left + (available.width - content.width * zoom) / 2 - content.x * zoom,
    y: insets.top + Math.max(spareHeight / 2, 0) - content.y * zoom,
    zoom,
  };
}

/** Side of a node an edge connects to. Same values as React Flow's `Position`. */
export type Side = NodeSide;

/** Direction pointing out of a node through each of its sides. */
export const OUTWARD: Record<Side, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** Arrowhead size in diagram pixels: from base to tip, and across the base. */
export const ARROW_LENGTH = 9;
export const ARROW_WIDTH = 9;

/**
 * Direction in which an edge arrives at the side of its target. Both a bezier edge, which
 * leaves its last control point straight towards the target, and a right-angled one, whose
 * last segment runs straight into it, end in this direction.
 */
const ARRIVAL: Record<Side, { x: number; y: number }> = {
  left: { x: 1, y: 0 },
  right: { x: -1, y: 0 },
  top: { x: 0, y: 1 },
  bottom: { x: 0, y: -1 },
};

/**
 * Arrowhead of an edge whose tip touches its target at (x, y) on this side:
 * the point where the line should end, at the middle of the base, and the
 * outline of the triangle as SVG path data.
 */
export function arrowhead(
  x: number,
  y: number,
  side: Side,
): { base: { x: number; y: number }; outline: string } {
  const arrival = ARRIVAL[side];
  const base = { x: x - arrival.x * ARROW_LENGTH, y: y - arrival.y * ARROW_LENGTH };
  const half = ARROW_WIDTH / 2;
  const outline =
    `M ${base.x - arrival.y * half} ${base.y + arrival.x * half} ` +
    `L ${x} ${y} ` +
    `L ${base.x + arrival.y * half} ${base.y - arrival.x * half} Z`;
  return { base, outline };
}

/** Point where an edge leaves or reaches a node on this side: the middle of that side. */
export function sidePoint(box: Box, side: Side): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: box.x, y: box.y + box.height / 2 };
    case 'right':
      return { x: box.x + box.width, y: box.y + box.height / 2 };
    case 'top':
      return { x: box.x + box.width / 2, y: box.y };
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y + box.height };
  }
}

/** The sides edges leave from and arrive at unless they are told otherwise: out by right or bottom, in by left or top. */
export interface EdgeSides {
  readonly source: Side;
  readonly target: Side;
}

/** Sides of a connection that were chosen by hand; the other one is left to `edgeSides`. */
export interface FixedSides {
  readonly source?: Side | undefined;
  readonly target?: Side | undefined;
}

const ALL_SIDES: readonly Side[] = ['right', 'bottom', 'left', 'top'];

/** The four ways to join two nodes, in the order they win a tie for each flow direction. */
const ACROSS = { source: 'right', target: 'left' } as const;
const DOWN = { source: 'bottom', target: 'top' } as const;
const COMBINATIONS: Record<'horizontal' | 'vertical', readonly EdgeSides[]> = {
  horizontal: [
    ACROSS,
    DOWN,
    { source: 'right', target: 'top' },
    { source: 'bottom', target: 'left' },
  ],
  vertical: [
    DOWN,
    ACROSS,
    { source: 'bottom', target: 'left' },
    { source: 'right', target: 'top' },
  ],
};

/** How much a pixel of going against the side an edge leaves or arrives at costs, in pixels of length. */
const AGAINST_COST = 3;

/** Pixels the line has to go against the sides it leaves and arrives at to join the two points. */
function againstSides(from: Point, to: Point, sides: EdgeSides): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const out = OUTWARD[sides.source];
  const into = OUTWARD[sides.target];
  // Leaving a side towards a point behind it, or arriving from the side of the point it lies beyond.
  const along = (axis: 'x' | 'y') =>
    Math.max(0, -(axis === 'x' ? dx : dy) * out[axis], (axis === 'x' ? dx : dy) * into[axis]);
  return along('x') + along('y');
}

type Point = { x: number; y: number };

/**
 * Sides an edge connects, from the position of its two nodes. Unless told
 * otherwise it leaves by the right or the bottom of the source and arrives at
 * the left or the top of the target: of the four combinations, it picks the
 * one with the shortest line, counting extra for lines that would leave a side
 * backwards (for example, leaving by the right towards a target on the left).
 * Ties go to the combination that follows the flow direction.
 *
 * `fixed` holds the sides chosen by hand. The end that was not chosen then
 * takes any of the four sides, whichever makes the shortest line with the other.
 */
export function edgeSides(
  source: Box,
  target: Box,
  direction: LayoutDirection,
  fixed: FixedSides = {},
): EdgeSides {
  const options: readonly EdgeSides[] =
    fixed.source === undefined && fixed.target === undefined
      ? COMBINATIONS[direction === 'LR' || direction === 'RL' ? 'horizontal' : 'vertical']
      : (fixed.source === undefined ? ALL_SIDES : [fixed.source]).flatMap((from) =>
          (fixed.target === undefined ? ALL_SIDES : [fixed.target]).map((to) => ({
            source: from,
            target: to,
          })),
        );
  let best = options[0] as EdgeSides;
  let bestCost = Infinity;
  for (const option of options) {
    const from = sidePoint(source, option.source);
    const to = sidePoint(target, option.target);
    const cost =
      Math.hypot(to.x - from.x, to.y - from.y) + AGAINST_COST * againstSides(from, to, option);
    if (cost < bestCost) {
      best = option;
      bestCost = cost;
    }
  }
  return best;
}

/** The side of `box` that a point is closest to, inside or outside it. */
export function nearestSide(box: Box, point: Point): Side {
  let best: Side = 'right';
  let bestDistance = Infinity;
  for (const side of ALL_SIDES) {
    const distance = distanceToSide(box, side, point);
    if (distance < bestDistance) {
      best = side;
      bestDistance = distance;
    }
  }
  return best;
}

function distanceToSide(box: Box, side: Side, point: Point): number {
  const horizontal = side === 'top' || side === 'bottom';
  const line = horizontal
    ? side === 'top'
      ? box.y
      : box.y + box.height
    : side === 'left'
      ? box.x
      : box.x + box.width;
  const [from, to] = horizontal ? [box.x, box.x + box.width] : [box.y, box.y + box.height];
  const along = horizontal ? point.x : point.y;
  const across = horizontal ? point.y : point.x;
  return Math.hypot(across - line, along - Math.min(Math.max(along, from), to));
}
