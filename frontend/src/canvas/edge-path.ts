import type { EdgeRoute, EdgeStyle, Point } from '@archdraft/shared';
import { getBezierPath, Position } from '@xyflow/react';
import { type Box, OUTWARD, type Side } from './geometry.ts';
import { routeAround } from './router.ts';

/** Radius of the corners of a right-angled connection, in diagram pixels. */
export const CORNER_RADIUS = 6;

/** Length of the straight run out of a side, and into the arrowhead, in a connection that has to turn back. */
const STUB = 20;
/** How far a right-angled connection between aligned nodes that cannot see each other swings out sideways. */
const DETOUR = 40;
/** The least a right-angled connection runs straight out of a side, and into the arrowhead, before it turns. */
const MIN_RUN = 12;
/** Coordinates closer than this, in diagram pixels, count as the same: a line between them is straight. */
const SAME = 1;

export interface ConnectionEnds {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  /** Sides of the nodes the connection leaves from and arrives at; React Flow's `Position` has the same values. */
  readonly sourcePosition: Side;
  readonly targetPosition: Side;
}

export interface ConnectionShape {
  /** SVG path data. */
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  /**
   * The points the line is drawn through, both ends included: the corners of a right-angled
   * line, or the ends of a curve and the points it passes through.
   */
  readonly corners: readonly Point[];
  /** The middle of each part of the line, between two consecutive corners. */
  readonly midpoints: readonly Point[];
}

const ORIGIN: Point = { x: 0, y: 0 };

/** React Flow's name for each side, which its curve helper expects. */
const POSITIONS = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
} as const;

/**
 * The shape of a connection drawn in `style`. Both styles leave a side of the source and
 * reach a side of the target straight, so the arrowhead (`arrowhead` in geometry.ts) fits
 * either one.
 *
 * `points` are the points the connection was routed through by hand. A curve passes through
 * each of them, smoothly; a right-angled line turns at them, adding the corners it needs to
 * stay at right angles and to leave and arrive straight. Without points, the connection is
 * the one drawn by default: round the `obstacles` in its way, the boxes of the nodes, when
 * they are given. A curve that would cross one passes instead through the corners of the
 * right-angled route round them.
 */
export function connectionPath(
  style: EdgeStyle,
  ends: ConnectionEnds,
  points: readonly Point[] = [],
  obstacles: readonly Box[] = [],
): ConnectionShape {
  if (style === 'square') {
    const corners =
      points.length > 0
        ? orthogonal(ends, points)
        : ((obstacles.length > 0 ? routed(ends, obstacles) : null) ?? squarePoints(ends));
    const label = labelPoint(corners);
    return {
      path: rounded(corners),
      labelX: label.x,
      labelY: label.y,
      corners,
      midpoints: corners.slice(1).map((to, index) => middle(corners[index] as Point, to)),
    };
  }
  if (points.length > 0) return throughPath(ends, points);
  if (obstacles.length > 0 && crossesAny(squarePoints(ends), obstacles)) {
    const around = routed(ends, obstacles);
    if (around !== null && around.length > 2) return throughPath(ends, around.slice(1, -1));
  }
  return curvedPath(ends);
}

/** The corners of the right-angled route round the obstacles, ends included; null when boxed in. */
function routed(ends: ConnectionEnds, obstacles: readonly Box[]): Point[] | null {
  const route = routeAround(
    { x: ends.sourceX, y: ends.sourceY },
    ends.sourcePosition,
    { x: ends.targetX, y: ends.targetY },
    ends.targetPosition,
    obstacles,
  );
  return route === null ? null : [...route.corners];
}

/** Whether a line through the corners passes through the inside of one of the boxes. */
function crossesAny(corners: readonly Point[], boxes: readonly Box[]): boolean {
  return corners.slice(1).some((to, index) => {
    const from = corners[index] as Point;
    return boxes.some(
      (box) =>
        Math.max(from.x, to.x) > box.x + SAME &&
        Math.min(from.x, to.x) < box.x + box.width - SAME &&
        Math.max(from.y, to.y) > box.y + SAME &&
        Math.min(from.y, to.y) < box.y + box.height - SAME,
    );
  });
}

/**
 * The points a connection is routed through: those of its route or, for a route kept before
 * there were points, the ones its `bend` stands for, worked out from where it falls by default.
 */
export function routePoints(
  style: EdgeStyle,
  ends: ConnectionEnds,
  route: EdgeRoute | undefined,
): readonly Point[] {
  if (route?.points !== undefined) return route.points;
  const bend = route?.bend;
  if (bend === undefined || (bend.x === 0 && bend.y === 0)) return [];
  if (style === 'square') return squarePoints(ends, bend).slice(1, -1);
  const home = curvedPath(ends);
  return [{ x: home.labelX + bend.x, y: home.labelY + bend.y }];
}

/**
 * The points of a right-angled connection once the part between `corners[index]` and the next
 * corner is dragged to `to`. The part only moves across its own direction, and the parts next
 * to it stretch to follow. The first and the last part cannot leave the side of their node, so
 * moving one of them keeps a short run out of the side and turns from there. Corners that end
 * up in a straight line are dropped, so dragging a part back into line takes its corners away.
 */
export function moveSegment(
  ends: ConnectionEnds,
  corners: readonly Point[],
  index: number,
  to: Point,
): Point[] {
  const from = corners[index];
  const next = corners[index + 1];
  if (from === undefined || next === undefined) return corners.slice(1, -1);
  const horizontal = Math.abs(from.y - next.y) < SAME;
  const shifted = (point: Point): Point =>
    horizontal ? { x: point.x, y: to.y } : { x: to.x, y: point.y };
  const run = Math.min(STUB, distance(from, next) / 2);
  const moved = corners.map((point, at) =>
    at === index || at === index + 1 ? shifted(point) : point,
  );
  if (index + 1 === corners.length - 1) {
    const stub = toward(next, from, run);
    moved.splice(moved.length - 1, 1, shifted(stub), stub, next);
  }
  if (index === 0) {
    const stub = toward(from, next, run);
    moved.splice(0, 1, from, stub, shifted(stub));
  }
  const source = { x: ends.sourceX, y: ends.sourceY };
  const target = { x: ends.targetX, y: ends.targetY };
  return simplified([source, ...moved.slice(1, -1), target]).slice(1, -1);
}

// ---------------------------------------------------------------- curves

function curvedPath(ends: ConnectionEnds): ConnectionShape {
  const [path, labelX, labelY] = getBezierPath({
    ...ends,
    sourcePosition: POSITIONS[ends.sourcePosition],
    targetPosition: POSITIONS[ends.targetPosition],
  });
  return {
    path,
    labelX,
    labelY,
    corners: [
      { x: ends.sourceX, y: ends.sourceY },
      { x: ends.targetX, y: ends.targetY },
    ],
    midpoints: [{ x: labelX, y: labelY }],
  };
}

/**
 * A smooth curve through the points, in order: one cubic part between each two of them, with
 * the tangent at each point parallel to the line between its neighbours (a Catmull-Rom spline),
 * leaving the source and arriving at the target straight out of their sides.
 */
function throughPath(ends: ConnectionEnds, points: readonly Point[]): ConnectionShape {
  const source = { x: ends.sourceX, y: ends.sourceY };
  const target = { x: ends.targetX, y: ends.targetY };
  const corners = [source, ...points, target];
  const last = corners.length - 1;
  const out = OUTWARD[ends.sourcePosition];
  const into = OUTWARD[ends.targetPosition];
  // The pull of each point on the parts at either side of it, a third of its tangent.
  const pull = corners.map((point, index): Point => {
    if (index === 0) {
      const reach = distance(point, corners[1] as Point) / 2;
      return { x: out.x * reach, y: out.y * reach };
    }
    if (index === last) {
      const reach = distance(corners[last - 1] as Point, point) / 2;
      return { x: -into.x * reach, y: -into.y * reach };
    }
    const before = corners[index - 1] as Point;
    const after = corners[index + 1] as Point;
    return { x: (after.x - before.x) / 6, y: (after.y - before.y) / 6 };
  });
  let path = `M ${source.x} ${source.y}`;
  const midpoints: Point[] = [];
  for (let index = 0; index < last; index++) {
    const from = corners[index] as Point;
    const to = corners[index + 1] as Point;
    const first = { x: from.x + (pull[index] as Point).x, y: from.y + (pull[index] as Point).y };
    const second = {
      x: to.x - (pull[index + 1] as Point).x,
      y: to.y - (pull[index + 1] as Point).y,
    };
    path += ` C ${first.x} ${first.y} ${second.x} ${second.y} ${to.x} ${to.y}`;
    // The point halfway along the parameter of a cubic curve.
    midpoints.push({
      x: (from.x + 3 * first.x + 3 * second.x + to.x) / 8,
      y: (from.y + 3 * first.y + 3 * second.y + to.y) / 8,
    });
  }
  // The label goes at the middle point, or at the middle of the middle part.
  const label =
    last % 2 === 0 ? (corners[last / 2] as Point) : (midpoints[(last - 1) / 2] as Point);
  return { path, labelX: label.x, labelY: label.y, corners, midpoints };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function middle(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function unit(vector: Point, fallback: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  return length === 0 ? fallback : { x: vector.x / length, y: vector.y / length };
}

// ---------------------------------------------------------- right angles

/**
 * The corners of a right-angled connection that nobody routed, ends included. `bend` moves its
 * middle segment, as routes kept before there were points did. Three kinds of route:
 *
 * - Sides that face along the same axis (right and left, or both bottom): the line goes out,
 *   crosses over at a channel perpendicular to that axis, and goes in. When the sides face
 *   each other but the nodes overlap along the axis, the line instead leaves by a short run,
 *   crosses over along the other axis, and comes in by a short run.
 * - Sides on different axes: a single corner when the line can reach it going straight out of
 *   the source and straight into the target, else a detour.
 */
function squarePoints(ends: ConnectionEnds, bend: Point = ORIGIN): Point[] {
  const source = { x: ends.sourceX, y: ends.sourceY };
  const target = { x: ends.targetX, y: ends.targetY };
  const out = OUTWARD[ends.sourcePosition];
  const into = OUTWARD[ends.targetPosition];
  const sourceAxis = out.x === 0 ? 'y' : 'x';
  const targetAxis = into.x === 0 ? 'y' : 'x';
  const cross = sourceAxis === 'x' ? 'y' : 'x';

  /** A point with `along` on the axis of the source side and `across` on the other one. */
  const at = (along: number, across: number): Point =>
    sourceAxis === 'x' ? { x: along, y: across } : { x: across, y: along };

  if (sourceAxis !== targetAxis) {
    // The corner shares the coordinate along the source side with the target, and the one across it with the source.
    const corner = at(target[sourceAxis], source[cross]);
    const straightOut = (corner[sourceAxis] - source[sourceAxis]) * out[sourceAxis] >= MIN_RUN;
    const straightIn = (corner[targetAxis] - target[targetAxis]) * into[targetAxis] >= MIN_RUN;
    if (straightOut && straightIn) return simplified([source, corner, target]);
    const first = { x: source.x + out.x * STUB, y: source.y + out.y * STUB };
    const last = { x: target.x + into.x * STUB, y: target.y + into.y * STUB };
    return simplified([source, first, at(first[sourceAxis], last[cross]), last, target]);
  }

  const axis = sourceAxis;
  // The channel has to be clear of both sides by the least straight run.
  let low = -Infinity;
  let high = Infinity;
  for (const [side, point] of [
    [out, source],
    [into, target],
  ] as const) {
    if (side[axis] > 0) low = Math.max(low, point[axis] + MIN_RUN);
    else high = Math.min(high, point[axis] - MIN_RUN);
  }

  // Nodes in line, with sides that do not face each other, cannot be joined by a line across.
  const seen =
    (target[axis] - source[axis]) * out[axis] > 0 && (source[axis] - target[axis]) * into[axis] > 0;
  if (low <= high && (source[cross] !== target[cross] || seen)) {
    // Halfway between the sides that face each other; else a short way past the farthest one.
    const base =
      low === -Infinity
        ? high - (STUB - MIN_RUN)
        : high === Infinity
          ? low + (STUB - MIN_RUN)
          : (low + high) / 2;
    const channel = Math.min(Math.max(base + bend[axis], low), high);
    return simplified([source, at(channel, source[cross]), at(channel, target[cross]), target]);
  }

  // The sides face each other but the nodes overlap: out a short run, across, and in a short run.
  const first = { x: source.x + out.x * STUB, y: source.y + out.y * STUB };
  const last = { x: target.x + into.x * STUB, y: target.y + into.y * STUB };
  const aligned = source[cross] === target[cross];
  const lane = (source[cross] + target[cross]) / 2 + (aligned ? DETOUR : 0) + bend[cross];
  return simplified([source, first, at(first[axis], lane), at(last[axis], lane), last, target]);
}

/**
 * The corners of a right-angled line through `points`. Between two points that are not in
 * line it turns once, crossing the direction it came from. It leaves the source straight out
 * of its side and arrives at the target straight into its side, with a short run first when
 * the point is beside or behind the side.
 */
function orthogonal(ends: ConnectionEnds, points: readonly Point[]): Point[] {
  const source = { x: ends.sourceX, y: ends.sourceY };
  const target = { x: ends.targetX, y: ends.targetY };
  const line: Point[] = [
    source,
    ...fromEnd(source, points[0] as Point, OUTWARD[ends.sourcePosition]),
  ];
  for (const point of points) {
    const from = line[line.length - 1] as Point;
    if (Math.abs(from.x - point.x) >= SAME && Math.abs(from.y - point.y) >= SAME) {
      const before = line[line.length - 2];
      const cameAcross = before !== undefined && Math.abs(before.y - from.y) < SAME;
      line.push(cameAcross ? { x: from.x, y: point.y } : { x: point.x, y: from.y });
    }
    line.push(point);
  }
  const into = fromEnd(target, points[points.length - 1] as Point, OUTWARD[ends.targetPosition]);
  return simplified([...line, ...into.reverse(), target]);
}

/** Corners from an end, going straight out of its side, to a point that is then in line with the last one. */
function fromEnd(end: Point, point: Point, side: Point): Point[] {
  const axis = side.x === 0 ? 'y' : 'x';
  const cross = axis === 'x' ? 'y' : 'x';
  const ahead = (point[axis] - end[axis]) * side[axis];
  if (Math.abs(point[cross] - end[cross]) < SAME && ahead >= 0) return [];
  const at = (along: number, across: number): Point =>
    axis === 'x' ? { x: along, y: across } : { x: across, y: along };
  if (ahead >= MIN_RUN) return [at(point[axis], end[cross])];
  const stub = { x: end.x + side.x * STUB, y: end.y + side.y * STUB };
  return [stub, at(stub[axis], point[cross])];
}

/** The corners without repeated points, nor points on the straight line between their neighbours. */
function simplified(corners: readonly Point[]): Point[] {
  const distinct = corners.filter((point, index) => {
    const previous = corners[index - 1];
    return (
      previous === undefined ||
      Math.abs(previous.x - point.x) >= SAME ||
      Math.abs(previous.y - point.y) >= SAME
    );
  });
  return distinct.filter((point, index) => {
    const before = distinct[index - 1];
    const after = distinct[index + 1];
    if (before === undefined || after === undefined) return true;
    const vertical = Math.abs(before.x - point.x) < SAME && Math.abs(point.x - after.x) < SAME;
    const horizontal = Math.abs(before.y - point.y) < SAME && Math.abs(point.y - after.y) < SAME;
    return !vertical && !horizontal;
  });
}

/** SVG path through the corners, with each one rounded. */
function rounded(bends: readonly Point[]): string {
  const first = bends[0];
  const last = bends[bends.length - 1];
  if (first === undefined || last === undefined) return '';
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < bends.length - 1; index++) {
    const before = bends[index - 1] as Point;
    const corner = bends[index] as Point;
    const after = bends[index + 1] as Point;
    const radius = Math.min(
      CORNER_RADIUS,
      distance(before, corner) / 2,
      distance(corner, after) / 2,
    );
    const entry = toward(corner, before, radius);
    const exit = toward(corner, after, radius);
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  return `${path} L ${last.x} ${last.y}`;
}

/** The point `length` away from `from` on the way to `to`. */
function toward(from: Point, to: Point, length: number): Point {
  const direction = unit({ x: to.x - from.x, y: to.y - from.y }, ORIGIN);
  return { x: from.x + direction.x * length, y: from.y + direction.y * length };
}

/**
 * Where the label of a right-angled connection goes: the middle of its middle segment when it
 * has one, as a line that crosses over between two sides does, else of its longest segment.
 */
function labelPoint(points: readonly Point[]): Point {
  const segments = points.length - 1;
  if (segments >= 3 && segments % 2 === 1) {
    const half = (segments - 1) / 2;
    return middle(points[half] as Point, points[half + 1] as Point);
  }
  let best: Point = points[0] ?? ORIGIN;
  let longest = -1;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1] as Point;
    const to = points[index] as Point;
    const length = distance(from, to);
    if (length > longest) {
      longest = length;
      best = middle(from, to);
    }
  }
  return best;
}
