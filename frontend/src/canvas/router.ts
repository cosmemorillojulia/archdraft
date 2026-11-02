import type { Point } from '@archdraft/shared';
import { type Box, OUTWARD, type Side } from './geometry.ts';

/**
 * Right-angled routes that go round the nodes in their way, as draw.io and libavoid do: a
 * shortest path on a sparse grid made of the lines that run along the nodes, a little away
 * from them, and of the lines halfway between them, where a connection is easiest to follow.
 * Each turn costs as much as a stretch of line, so routes turn as little as they can, and a
 * line that runs along a node costs a little more than one down the middle of a gap.
 */

/** How far a route keeps from the nodes, tried in turn: nodes close together leave less room. */
const CLEARANCES = [16, 8, 3] as const;
/** What a turn costs, in pixels of line. */
const BEND_COST = 32;
/** Cost of each pixel of line that runs along a node instead of down the middle of a gap. */
const HUG_FACTOR = 1.08;
/** How far past its two ends a route looks for nodes, and may go round them. */
const REACH = 160;
/** Routes kept, so that redrawing the diagram, or dragging one node, does not route every line again. */
const MAX_CACHED = 4000;
/** Coordinates closer than this are the same. */
const SAME = 0.5;

export interface Route {
  /** The corners of the line, its two ends included. */
  readonly corners: readonly Point[];
  /** Its length, with each turn counted as `BEND_COST`. */
  readonly cost: number;
}

/** Directions of travel: right, left, down, up. */
const STEPS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function directionOf(vector: { x: number; y: number }): number {
  if (vector.x > 0) return 0;
  if (vector.x < 0) return 1;
  return vector.y > 0 ? 2 : 3;
}

const cache = new Map<string, Route | null>();

/**
 * A right-angled route from `from`, on the side `fromSide` of its node, to `to`, which lies
 * out of the side `toSide` of the other one, clear of `obstacles` (the boxes of the nodes,
 * the two it joins included, so the line does not cross them either). It leaves and arrives
 * straight. Null when there is no way round, as when the ends are boxed in.
 */
export function routeAround(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  obstacles: readonly Box[],
): Route | null {
  const widest = CLEARANCES[0];
  const region = regionOf(from, to, fromSide, toSide, widest);
  const near = obstacles.filter((box) => intersects(inflate(box, widest), region));
  const key = [
    from.x,
    from.y,
    fromSide,
    to.x,
    to.y,
    toSide,
    ...near.flatMap((box) => [box.x, box.y, box.width, box.height]),
  ].join(',');
  const known = cache.get(key);
  if (known !== undefined) return known;

  let route: Route | null = null;
  for (const clearance of CLEARANCES) {
    route = search(
      from,
      fromSide,
      to,
      toSide,
      near,
      regionOf(from, to, fromSide, toSide, clearance),
      clearance,
    );
    if (route === null && near.length < obstacles.length) {
      // Something just out of reach closes the way: look round the whole diagram.
      const everything = boundsOf([...obstacles, region]);
      route = search(from, fromSide, to, toSide, obstacles, everything, clearance);
    }
    if (route !== null) break;
  }
  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(key, route);
  return route;
}

/** The box of both ends and their first step out, with `REACH` all round. */
function regionOf(from: Point, to: Point, fromSide: Side, toSide: Side, clearance: number): Box {
  const a = stepOut(from, fromSide, clearance);
  const b = stepOut(to, toSide, clearance);
  const x = Math.min(a.x, b.x) - REACH;
  const y = Math.min(a.y, b.y) - REACH;
  return {
    x,
    y,
    width: Math.max(a.x, b.x) + REACH - x,
    height: Math.max(a.y, b.y) + REACH - y,
  };
}

function stepOut(point: Point, side: Side, length: number): Point {
  const out = OUTWARD[side];
  return { x: point.x + out.x * length, y: point.y + out.y * length };
}

function inflate(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 };
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function boundsOf(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((box) => box.x)) - REACH;
  const y = Math.min(...boxes.map((box) => box.y)) - REACH;
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + REACH;
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + REACH;
  return { x, y, width: right - x, height: bottom - y };
}

/** Whether a point is inside the box, not on its border. */
function inside(point: Point, box: Box): boolean {
  return (
    point.x > box.x + SAME &&
    point.x < box.x + box.width - SAME &&
    point.y > box.y + SAME &&
    point.y < box.y + box.height - SAME
  );
}

/** The values, sorted, without the ones that are the same as the one before. */
function distinct(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter(
    (value, index) => index === 0 || value - (sorted[index - 1] as number) > SAME,
  );
}

/**
 * The lines of the grid along one axis: the ends, the edges of the region, the lines a
 * clearance away from each obstacle, and the line halfway between each two of those. The lines
 * by the obstacles and through the ends are `hugging`: a stretch along them runs beside a node.
 */
function gridLines(
  ends: readonly number[],
  edges: readonly number[],
  low: number,
  high: number,
): { lines: number[]; hugging: Set<number> } {
  const kept = distinct(
    [...ends, ...edges, low, high].filter((value) => value >= low && value <= high),
  );
  const halves = kept.slice(1).map((value, index) => (value + (kept[index] as number)) / 2);
  const lines = distinct([...kept, ...halves]);
  const hugging = new Set<number>();
  for (const [index, value] of lines.entries()) {
    if ([...ends, ...edges].some((edge) => Math.abs(edge - value) <= SAME)) hugging.add(index);
  }
  return { lines, hugging };
}

/** A* over the grid, with the direction of travel in the state so turns can be counted. */
function search(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  obstacles: readonly Box[],
  region: Box,
  clearance: number,
): Route | null {
  const start = stepOut(from, fromSide, clearance);
  const goal = stepOut(to, toSide, clearance);
  const walls = obstacles.map((box) => inflate(box, clearance));
  if (walls.some((wall) => inside(start, wall) || inside(goal, wall))) return null;

  const xs = gridLines(
    [start.x, goal.x],
    walls.flatMap((wall) => [wall.x, wall.x + wall.width]),
    region.x,
    region.x + region.width,
  );
  const ys = gridLines(
    [start.y, goal.y],
    walls.flatMap((wall) => [wall.y, wall.y + wall.height]),
    region.y,
    region.y + region.height,
  );
  const nx = xs.lines.length;
  const ny = ys.lines.length;
  const indexOf = (lines: readonly number[], value: number) =>
    lines.findIndex((line) => Math.abs(line - value) <= SAME);
  const si = indexOf(xs.lines, start.x);
  const sj = indexOf(ys.lines, start.y);
  const gi = indexOf(xs.lines, goal.x);
  const gj = indexOf(ys.lines, goal.y);
  if (si < 0 || sj < 0 || gi < 0 || gj < 0) return null;

  const pointAt = (i: number, j: number): Point => ({
    x: xs.lines[i] as number,
    y: ys.lines[j] as number,
  });
  const blocked = new Uint8Array(nx * ny);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const point = pointAt(i, j);
      if (walls.some((wall) => inside(point, wall))) blocked[i * ny + j] = 1;
    }
  }
  const crosses = (a: Point, b: Point) => {
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return walls.some((wall) => inside(middle, wall));
  };

  const startDirection = directionOf(OUTWARD[fromSide]);
  const inward = OUTWARD[toSide];
  const arrival = directionOf({ x: -inward.x, y: -inward.y });
  const states = nx * ny * 4;
  const cost = new Float64Array(states).fill(Infinity);
  const parent = new Int32Array(states).fill(-1);
  const closed = new Uint8Array(states);
  const heap = new MinHeap();
  const goalPoint = pointAt(gi, gj);
  const estimate = (i: number, j: number) =>
    Math.abs((xs.lines[i] as number) - goalPoint.x) +
    Math.abs((ys.lines[j] as number) - goalPoint.y);

  const first = (si * ny + sj) * 4 + startDirection;
  cost[first] = 0;
  heap.push(first, estimate(si, sj));
  let best = -1;
  let bestCost = Infinity;
  // The estimate never exceeds what is left, so nothing still in the heap can beat a route found.
  while (heap.size > 0 && heap.lowest < bestCost) {
    const state = heap.pop();
    if (closed[state]) continue;
    closed[state] = 1;
    const g = cost[state] as number;
    const direction = state % 4;
    const cell = (state - direction) / 4;
    const i = Math.floor(cell / ny);
    const j = cell % ny;
    if (i === gi && j === gj) {
      const total =
        g + (direction === arrival ? 0 : BEND_COST * (direction === (arrival ^ 1) ? 2 : 1));
      if (total < bestCost) {
        bestCost = total;
        best = state;
      }
      continue;
    }
    for (let next = 0; next < 4; next++) {
      // No turning back on the spot.
      if (next === (direction ^ 1)) continue;
      const step = STEPS[next] as { x: number; y: number };
      const ni = i + step.x;
      const nj = j + step.y;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      if (blocked[ni * ny + nj]) continue;
      const a = pointAt(i, j);
      const b = pointAt(ni, nj);
      if (crosses(a, b)) continue;
      // A vertical stretch runs along a line of x, a horizontal one along a line of y.
      const hugs = step.x === 0 ? xs.hugging.has(i) : ys.hugging.has(j);
      const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const stepCost = length * (hugs ? HUG_FACTOR : 1) + (next === direction ? 0 : BEND_COST);
      const target = (ni * ny + nj) * 4 + next;
      const total = g + stepCost;
      if (total < (cost[target] as number)) {
        cost[target] = total;
        parent[target] = state;
        heap.push(target, total + estimate(ni, nj));
      }
    }
  }
  if (best < 0) return null;

  const path: Point[] = [];
  for (let state = best; state >= 0; state = parent[state] as number) {
    const cell = (state - (state % 4)) / 4;
    path.push(pointAt(Math.floor(cell / ny), cell % ny));
  }
  path.reverse();
  return { corners: straightened([from, ...path, to]), cost: bestCost };
}

/** The corners without repeats, nor points in the middle of a straight stretch. */
function straightened(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && Math.abs(last.x - point.x) <= SAME && Math.abs(last.y - point.y) <= SAME) continue;
    const before = kept[kept.length - 2];
    if (
      before &&
      last &&
      ((Math.abs(before.x - last.x) <= SAME && Math.abs(last.x - point.x) <= SAME) ||
        (Math.abs(before.y - last.y) <= SAME && Math.abs(last.y - point.y) <= SAME))
    ) {
      kept[kept.length - 1] = point;
      continue;
    }
    kept.push(point);
  }
  return kept;
}

/** A binary heap of states by priority, lowest first. */
class MinHeap {
  private readonly items: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.items.length;
  }

  /** The priority of the item `pop` returns next. */
  get lowest(): number {
    return this.priorities[0] ?? Infinity;
  }

  push(item: number, priority: number): void {
    const { items, priorities } = this;
    let at = items.length;
    items.push(item);
    priorities.push(priority);
    while (at > 0) {
      const up = (at - 1) >> 1;
      if ((priorities[up] as number) <= priority) break;
      items[at] = items[up] as number;
      priorities[at] = priorities[up] as number;
      at = up;
    }
    items[at] = item;
    priorities[at] = priority;
  }

  pop(): number {
    const { items, priorities } = this;
    const top = items[0] as number;
    const item = items.pop() as number;
    const priority = priorities.pop() as number;
    if (items.length === 0) return top;
    let at = 0;
    for (;;) {
      const left = at * 2 + 1;
      if (left >= items.length) break;
      const right = left + 1;
      const child =
        right < items.length && (priorities[right] as number) < (priorities[left] as number)
          ? right
          : left;
      if ((priorities[child] as number) >= priority) break;
      items[at] = items[child] as number;
      priorities[at] = priorities[child] as number;
      at = child;
    }
    items[at] = item;
    priorities[at] = priority;
    return top;
  }
}
