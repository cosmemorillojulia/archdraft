import {
  type ArchitectureGraph,
  type DiagramLayout,
  isContainerKind,
  ownEdgeRoute,
  type Point,
} from '@archdraft/shared';
import type { LayoutDirection } from '../layout/compute-layout.ts';
import { arrowhead, type Box, type EdgeSides, rankedSides, sidePoint } from './geometry.ts';
import { routeAround } from './router.ts';

/** Pairs of sides routed for each connection, from the ones that make the shortest line. */
const CANDIDATES = 4;
/** What each place lower in that order costs, in pixels: among routes alike, the flow wins. */
const RANK_COST = 8;
/** Space between the ends of the connections that share a side of a node. */
const PORT_GAP = 16;
/** The most of a side those ends take up. */
const PORT_SHARE = 0.6;
/**
 * How far apart, across, the ends of a connection between facing sides may be for one of them
 * to move so that the line runs straight instead of making a small step.
 */
const STRAIGHTEN = 24;
/** How close to a corner an end may move. */
const CORNER_MARGIN = 12;

/** Where a connection leaves its source and reaches its target. */
export interface EdgePlacement {
  readonly sides: EdgeSides;
  /** The point on the side of the source it leaves from. */
  readonly source: Point;
  /** The point on the side of the target where the tip of its arrowhead touches. */
  readonly target: Point;
}

export interface EdgeLayout {
  readonly placements: ReadonlyMap<string, EdgePlacement>;
  /** What connections go round: every node but the groups, and the text fixed to a box. */
  readonly obstacles: readonly Box[];
}

/**
 * Where every connection of the diagram leaves and arrives. The sides of each one are the
 * pair, among the few that make the shortest line, whose route round the nodes in the way is
 * shortest and turns least; sides chosen by hand stay. Connections that share a side of a node
 * spread along it instead of meeting at its middle, in the order of the nodes at their other
 * end, so they do not cross on the way there.
 */
export function placeEdges(
  graph: ArchitectureGraph,
  boxes: ReadonlyMap<string, Box>,
  layout: DiagramLayout,
  direction: LayoutDirection,
): EdgeLayout {
  const obstacles = graph.nodes.flatMap((node) => {
    const box = boxes.get(node.id);
    return box && !isContainerKind(node.kind) && node.attachedTo === undefined ? [box] : [];
  });

  const sidesOf = new Map<string, EdgeSides>();
  for (const edge of graph.edges) {
    const from = boxes.get(edge.source);
    const to = boxes.get(edge.target);
    if (!from || !to) continue;
    const route = ownEdgeRoute(layout, edge.id);
    const ranked = rankedSides(from, to, direction, route);
    // A route put by hand runs through its points, whatever is in the way.
    sidesOf.set(
      edge.id,
      route?.points === undefined
        ? bestRouted(from, to, ranked, obstacles)
        : (ranked[0] as { sides: EdgeSides }).sides,
    );
  }

  /** The ends that share each side of each node, with where the node at the other end lies along it. */
  const sharing = new Map<string, { id: string; end: 'source' | 'target'; along: number }[]>();
  for (const edge of graph.edges) {
    const sides = sidesOf.get(edge.id);
    if (!sides) continue;
    for (const end of ['source', 'target'] as const) {
      const node = end === 'source' ? edge.source : edge.target;
      const other = boxes.get(end === 'source' ? edge.target : edge.source) as Box;
      const horizontal = sides[end] === 'top' || sides[end] === 'bottom';
      const along = horizontal ? other.x + other.width / 2 : other.y + other.height / 2;
      const key = `${node}\u0000${sides[end]}`;
      const list = sharing.get(key) ?? [];
      list.push({ id: edge.id, end, along });
      sharing.set(key, list);
    }
  }

  const points = new Map<string, { source?: Point; target?: Point }>();
  for (const [key, ends] of sharing) {
    const [node, side] = key.split('\u0000') as [string, EdgeSides['source']];
    const box = boxes.get(node) as Box;
    const middle = sidePoint(box, side);
    const horizontal = side === 'top' || side === 'bottom';
    const length = horizontal ? box.width : box.height;
    ends.sort((a, b) => a.along - b.along || a.id.localeCompare(b.id) || (a.end < b.end ? -1 : 1));
    const gap = ends.length > 1 ? Math.min(PORT_GAP, (length * PORT_SHARE) / (ends.length - 1)) : 0;
    ends.forEach(({ id, end }, index) => {
      const offset = (index - (ends.length - 1) / 2) * gap;
      const point = horizontal
        ? { x: middle.x + offset, y: middle.y }
        : { x: middle.x, y: middle.y + offset };
      points.set(id, { ...points.get(id), [end]: point });
    });
  }

  const alone = (node: string, side: EdgeSides['source']) =>
    (sharing.get(`${node}\u0000${side}`)?.length ?? 0) === 1;
  const placements = new Map<string, EdgePlacement>();
  for (const edge of graph.edges) {
    const sides = sidesOf.get(edge.id);
    const { source, target } = points.get(edge.id) ?? {};
    if (!sides || !source || !target) continue;
    const straight = straightened(
      {
        box: boxes.get(edge.source) as Box,
        point: source,
        movable: alone(edge.source, sides.source),
      },
      {
        box: boxes.get(edge.target) as Box,
        point: target,
        movable: alone(edge.target, sides.target),
      },
      sides,
    );
    placements.set(edge.id, { sides, ...straight });
  }
  return { placements, obstacles };
}

interface End {
  readonly box: Box;
  readonly point: Point;
  /** Whether the end has its side to itself, and so can slide along it. */
  readonly movable: boolean;
}

/**
 * The ends of a connection between facing sides that are nearly level, slid along their sides
 * so the line runs straight: both to the middle of them when each has its side to itself, or
 * the one that does to the other. An end stays clear of the corners of its box, and ends that
 * share a side keep their place, so the connections there stay apart.
 */
export function straightened(
  from: End,
  to: End,
  sides: EdgeSides,
): { source: Point; target: Point } {
  const unchanged = { source: from.point, target: to.point };
  const across = sides.source === 'left' || sides.source === 'right' ? 'y' : 'x';
  const facing =
    across === 'y'
      ? (sides.source === 'right' && sides.target === 'left') ||
        (sides.source === 'left' && sides.target === 'right')
      : (sides.source === 'bottom' && sides.target === 'top') ||
        (sides.source === 'top' && sides.target === 'bottom');
  const step = to.point[across] - from.point[across];
  if (!facing || step === 0 || Math.abs(step) > STRAIGHTEN) return unchanged;

  const span = (end: End) => {
    const start = across === 'y' ? end.box.y : end.box.x;
    const length = across === 'y' ? end.box.height : end.box.width;
    return { min: start + CORNER_MARGIN, max: start + length - CORNER_MARGIN };
  };
  const line =
    from.movable && to.movable
      ? (from.point[across] + to.point[across]) / 2
      : from.movable
        ? to.point[across]
        : to.movable
          ? from.point[across]
          : undefined;
  if (line === undefined) return unchanged;
  const fits = (end: End) => {
    const { min, max } = span(end);
    return !end.movable || (line >= min && line <= max);
  };
  if (!fits(from) || !fits(to)) return unchanged;
  return {
    source: { ...from.point, [across]: line },
    target: { ...to.point, [across]: line },
  };
}

/** Of the first few pairs of sides, the one with the cheapest route round the obstacles. */
function bestRouted(
  from: Box,
  to: Box,
  ranked: readonly { sides: EdgeSides; cost: number }[],
  obstacles: readonly Box[],
): EdgeSides {
  const seen = new Set<string>();
  let best = (ranked[0] as { sides: EdgeSides }).sides;
  let bestCost = Infinity;
  let tried = 0;
  for (const { sides, cost } of ranked) {
    const key = `${sides.source}-${sides.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // No route is shorter than the straight line, which the cost of the pair starts from.
    if (tried >= CANDIDATES || cost >= bestCost) break;
    const start = sidePoint(from, sides.source);
    const tip = sidePoint(to, sides.target);
    const route = routeAround(
      start,
      sides.source,
      arrowhead(tip.x, tip.y, sides.target).base,
      sides.target,
      obstacles,
    );
    const total = route === null ? Infinity : route.cost + tried * RANK_COST;
    tried++;
    if (total < bestCost) {
      best = sides;
      bestCost = total;
    }
  }
  return best;
}
