import { type ArchitectureGraph, type DiagramLayout, layoutEntry } from '@archdraft/core';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
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

/** Cubic Bézier curve of an edge. */
export interface Curve {
  readonly start: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly end: Point;
}

/**
 * Curve of an edge: it leaves the source from the side facing the target and
 * enters the target from the opposite side. Flows are mostly left to right,
 * so horizontal sides win unless the boxes overlap horizontally.
 */
export function edgeCurve(source: Box, target: Box): Curve {
  const horizontal = target.x >= source.x + source.width || source.x >= target.x + target.width;
  if (horizontal) {
    const forward = target.x >= source.x + source.width;
    const start = { x: forward ? source.x + source.width : source.x, y: middleY(source) };
    const end = { x: forward ? target.x : target.x + target.width, y: middleY(target) };
    const bend = Math.max(Math.abs(end.x - start.x) / 2, 24) * (forward ? 1 : -1);
    return { start, c1: { x: start.x + bend, y: start.y }, c2: { x: end.x - bend, y: end.y }, end };
  }
  const down = middleY(target) >= middleY(source);
  const start = { x: middleX(source), y: down ? source.y + source.height : source.y };
  const end = { x: middleX(target), y: down ? target.y : target.y + target.height };
  const bend = Math.max(Math.abs(end.y - start.y) / 2, 24) * (down ? 1 : -1);
  return { start, c1: { x: start.x, y: start.y + bend }, c2: { x: end.x, y: end.y - bend }, end };
}

/** SVG path data of a curve. */
export function curvePath({ start, c1, c2, end }: Curve): string {
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
}

/** Point halfway along the curve parameter, where an edge label sits. */
export function curveMidpoint({ start, c1, c2, end }: Curve): Point {
  return {
    x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
    y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8,
  };
}

/** Straight-line distance between the ends, enough to pace animations along the edge. */
export function curveSpan({ start, end }: Curve): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

const middleX = (box: Box) => box.x + box.width / 2;
const middleY = (box: Box) => box.y + box.height / 2;

/** Shortens text to `max` characters with an ellipsis, for SVG text that cannot wrap. */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
