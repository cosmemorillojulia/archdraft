import type { EdgeStyle, Point } from '@archdraft/core';
import { getBezierPath, Position } from '@xyflow/react';
import { OUTWARD, type Side } from './geometry.ts';

/** Radius of the corners of a right-angled connection, in diagram pixels. */
export const CORNER_RADIUS = 6;

/** Length of the straight run out of a side, and into the arrowhead, in a connection that has to turn back. */
const STUB = 20;
/** How far a right-angled connection between aligned nodes that cannot see each other swings out sideways. */
const DETOUR = 40;
/** The least a right-angled connection runs straight out of a side, and into the arrowhead, before it turns. */
const MIN_RUN = 12;

export interface ConnectionEnds {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  /** Sides of the nodes the connection leaves from and arrives at; React Flow's `Position` has the same values. */
  readonly sourcePosition: Side;
  readonly targetPosition: Side;
}

/** The handle that moves the middle of a connection, and the directions in which it can go. */
export interface BendHandle extends Point {
  readonly axes: 'x' | 'y' | 'both';
}

export interface ConnectionShape {
  /** SVG path data. */
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  /** Null when the connection has no middle to move: a straight line or a single corner. */
  readonly bend: BendHandle | null;
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
 * `bend` moves the middle of the connection from where it falls by default: a curve is made
 * to pass through the moved point, and a right-angled connection moves the segment that
 * crosses the middle, along the one direction it can go. Without it, or with a connection
 * that has no middle to move, the connection is the one drawn by default.
 */
export function connectionPath(
  style: EdgeStyle,
  ends: ConnectionEnds,
  bend: Point = ORIGIN,
): ConnectionShape {
  return style === 'square' ? squarePath(ends, bend) : curvedPath(ends, bend);
}

// ---------------------------------------------------------------- curves

function curvedPath(ends: ConnectionEnds, bend: Point): ConnectionShape {
  const [path, labelX, labelY] = getBezierPath({
    ...ends,
    sourcePosition: POSITIONS[ends.sourcePosition],
    targetPosition: POSITIONS[ends.targetPosition],
  });
  if (bend.x === 0 && bend.y === 0) {
    return { path, labelX, labelY, bend: { x: labelX, y: labelY, axes: 'both' } };
  }
  const source = { x: ends.sourceX, y: ends.sourceY };
  const target = { x: ends.targetX, y: ends.targetY };
  const through = { x: labelX + bend.x, y: labelY + bend.y };
  // Through the moved point the curve runs parallel to the line between its ends, which keeps it
  // smooth there; it leaves and arrives straight, like the default one.
  const slope = unit(
    { x: target.x - source.x, y: target.y - source.y },
    OUTWARD[ends.sourcePosition],
  );
  const before = distance(source, through) / 2;
  const after = distance(through, target) / 2;
  const out = OUTWARD[ends.sourcePosition];
  const into = OUTWARD[ends.targetPosition];
  const curve =
    `M ${source.x} ${source.y} ` +
    `C ${source.x + out.x * before} ${source.y + out.y * before} ` +
    `${through.x - slope.x * before} ${through.y - slope.y * before} ${through.x} ${through.y} ` +
    `C ${through.x + slope.x * after} ${through.y + slope.y * after} ` +
    `${target.x + into.x * after} ${target.y + into.y * after} ${target.x} ${target.y}`;
  return { path: curve, labelX: through.x, labelY: through.y, bend: { ...through, axes: 'both' } };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function unit(vector: Point, fallback: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  return length === 0 ? fallback : { x: vector.x / length, y: vector.y / length };
}

// ---------------------------------------------------------- right angles

function squarePath(ends: ConnectionEnds, bend: Point): ConnectionShape {
  const { points, handle } = squarePoints(ends, bend);
  const path = rounded(points);
  const label = handle ?? longestMiddle(points);
  return { path, labelX: label.x, labelY: label.y, bend: handle };
}

/**
 * The corners of a right-angled connection and, when it has a middle segment that can move,
 * the handle for it. Three kinds of route:
 *
 * - Sides that face along the same axis (right and left, or both bottom): the line goes out,
 *   crosses over at a channel perpendicular to that axis, and goes in. The channel is the
 *   middle segment. When the sides face each other but the nodes overlap along the axis, the
 *   line instead leaves by a short run, crosses over along the other axis, and comes in by a
 *   short run.
 * - Sides on different axes: a single corner when the line can reach it going straight out of
 *   the source and straight into the target, else a detour.
 */
function squarePoints(
  ends: ConnectionEnds,
  bend: Point,
): { points: Point[]; handle: BendHandle | null } {
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
    if (straightOut && straightIn) return { points: [source, corner, target], handle: null };
    const first = { x: source.x + out.x * STUB, y: source.y + out.y * STUB };
    const last = { x: target.x + into.x * STUB, y: target.y + into.y * STUB };
    return {
      points: [source, first, at(first[sourceAxis], last[cross]), last, target],
      handle: null,
    };
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
    const points = [source, at(channel, source[cross]), at(channel, target[cross]), target];
    const across = (source[cross] + target[cross]) / 2;
    return {
      points,
      handle: source[cross] === target[cross] ? null : { ...at(channel, across), axes: axis },
    };
  }

  // The sides face each other but the nodes overlap: out a short run, across, and in a short run.
  const first = { x: source.x + out.x * STUB, y: source.y + out.y * STUB };
  const last = { x: target.x + into.x * STUB, y: target.y + into.y * STUB };
  const aligned = source[cross] === target[cross];
  const lane = (source[cross] + target[cross]) / 2 + (aligned ? DETOUR : 0) + bend[cross];
  const points = [source, first, at(first[axis], lane), at(last[axis], lane), last, target];
  return { points, handle: { ...at((first[axis] + last[axis]) / 2, lane), axes: cross } };
}

/** SVG path through `points` with their corners rounded; a point on the line between two others is dropped. */
function rounded(corners: readonly Point[]): string {
  const points = corners.filter((point, index) => {
    const previous = corners[index - 1];
    return previous === undefined || previous.x !== point.x || previous.y !== point.y;
  });
  const bends = points.filter((point, index) => {
    const before = points[index - 1];
    const after = points[index + 1];
    if (before === undefined || after === undefined) return true;
    return !(
      (before.x === point.x && point.x === after.x) ||
      (before.y === point.y && point.y === after.y)
    );
  });
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

/** The middle of the longest segment, where the label of a connection without a middle segment goes. */
function longestMiddle(points: readonly Point[]): Point {
  let best: Point = points[0] ?? ORIGIN;
  let longest = -1;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1] as Point;
    const to = points[index] as Point;
    const length = distance(from, to);
    if (length > longest) {
      longest = length;
      best = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    }
  }
  return best;
}
