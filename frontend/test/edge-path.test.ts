import { describe, expect, it } from 'vitest';
import {
  type ConnectionEnds,
  connectionPath,
  CORNER_RADIUS,
  moveSegment,
  routePoints,
} from '../src/canvas/edge-path.ts';
import { OUTWARD, type Side } from '../src/canvas/geometry.ts';

const ends = (source: [number, number, Side], target: [number, number, Side]): ConnectionEnds => ({
  sourceX: source[0],
  sourceY: source[1],
  sourcePosition: source[2],
  targetX: target[0],
  targetY: target[1],
  targetPosition: target[2],
});

/** The points of a right-angled line whose middle an older route shifted by `bend`. */
const bent = (line: ConnectionEnds, bend: { x: number; y: number }) =>
  routePoints('square', line, { bend });

/** The numbers of an SVG path, two by two. */
function pointsOf(path: string): { x: number; y: number }[] {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return Array.from({ length: numbers.length / 2 }, (_, i) => ({
    x: numbers[i * 2] as number,
    y: numbers[i * 2 + 1] as number,
  }));
}

/** The points where a right-angled path starts, turns and stops, leaving out the curve of each corner. */
function corners(path: string): { x: number; y: number }[] {
  const commands = path.match(/[MLQ][^MLQ]*/g) ?? [];
  const found: { x: number; y: number }[] = [];
  commands.forEach((command, index) => {
    const values = pointsOf(command);
    if (command.startsWith('Q')) {
      // `Q corner exit`: the corner is the control point.
      if (values[0]) found.push(values[0]);
    } else if (index === 0 || index === commands.length - 1) {
      const point = values[0];
      if (point) found.push(point);
    }
  });
  return found;
}

/** Whether every part of a line runs across or down. */
function rightAngled(points: readonly { x: number; y: number }[]): boolean {
  return points.slice(1).every((b, i) => {
    const a = points[i];
    return a !== undefined && (a.x === b.x || a.y === b.y);
  });
}

describe('connectionPath, curved', () => {
  const across = ends([100, 50, 'right'], [300, 150, 'left']);

  it('is the default curve without points, with a place to add one in its middle', () => {
    const shape = connectionPath('curved', across);
    expect(shape.path).toMatch(/^M ?100,?50 ?C/);
    expect(shape.corners).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 150 },
    ]);
    expect(shape.midpoints).toEqual([{ x: shape.labelX, y: shape.labelY }]);
    expect(connectionPath('curved', across, []).path).toBe(shape.path);
  });

  it('passes through each point, in order, with one part between each two', () => {
    const shape = connectionPath('curved', across, [
      { x: 160, y: -20 },
      { x: 240, y: 220 },
    ]);
    expect(shape.path.match(/C/g)).toHaveLength(3);
    const numbers = pointsOf(shape.path);
    expect(numbers[3]).toEqual({ x: 160, y: -20 });
    expect(numbers[6]).toEqual({ x: 240, y: 220 });
    expect(shape.corners).toHaveLength(4);
    expect(shape.midpoints).toHaveLength(3);
  });

  it('puts the label on the middle point, or in the middle of the middle part', () => {
    const one = connectionPath('curved', across, [{ x: 200, y: 20 }]);
    expect([one.labelX, one.labelY]).toEqual([200, 20]);
    const two = connectionPath('curved', across, [
      { x: 160, y: 0 },
      { x: 240, y: 200 },
    ]);
    expect({ x: two.labelX, y: two.labelY }).toEqual(two.midpoints[1]);
  });

  it('still leaves its side and reaches the other one in a straight line', () => {
    for (const points of [
      [{ x: 100, y: 140 }],
      [{ x: 60, y: -10 }],
      [
        { x: 250, y: 50 },
        { x: 260, y: 300 },
      ],
    ]) {
      const p = pointsOf(connectionPath('curved', across, points).path);
      // First control point straight out of the right side, last straight into the left one.
      expect(p[1]?.y).toBeCloseTo(50);
      expect(p[1]?.x).toBeGreaterThan(100);
      expect(p[p.length - 2]?.y).toBeCloseTo(150);
      expect(p[p.length - 2]?.x).toBeLessThan(300);
    }
  });

  it('copes with a point on top of an end', () => {
    expect(connectionPath('curved', across, [{ x: 100, y: 50 }]).path).not.toContain('NaN');
    const still = connectionPath('curved', ends([0, 0, 'right'], [0, 0, 'left']), [{ x: 0, y: 0 }]);
    expect(still.path).not.toContain('NaN');
  });
});

describe('routePoints', () => {
  const across = ends([100, 50, 'right'], [300, 150, 'left']);

  it('are the points of the route, or none', () => {
    expect(routePoints('curved', across, undefined)).toEqual([]);
    expect(routePoints('square', across, { source: 'top' })).toEqual([]);
    expect(routePoints('curved', across, { points: [{ x: 1, y: 2 }] })).toEqual([{ x: 1, y: 2 }]);
  });

  it('turn the shifted middle of an older route into the points it stood for', () => {
    const home = connectionPath('curved', across);
    expect(routePoints('curved', across, { bend: { x: 10, y: -80 } })).toEqual([
      { x: home.labelX + 10, y: home.labelY - 80 },
    ]);
    // Right angles: the crossing segment, moved along its one direction only.
    expect(routePoints('square', across, { bend: { x: 40, y: 500 } })).toEqual([
      { x: 240, y: 50 },
      { x: 240, y: 150 },
    ]);
  });
});

describe('moveSegment', () => {
  const across = ends([100, 50, 'right'], [300, 150, 'left']);
  const line = connectionPath('square', across).corners;

  it('moves a middle part across its direction only, and the parts beside it follow', () => {
    expect(moveSegment(across, line, 1, { x: 240, y: 999 })).toEqual([
      { x: 240, y: 50 },
      { x: 240, y: 150 },
    ]);
  });

  it('keeps a short run out of the side when the first part moves', () => {
    expect(moveSegment(across, line, 0, { x: 150, y: 20 })).toEqual([
      { x: 120, y: 50 },
      { x: 120, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 150 },
    ]);
  });

  it('bends a straight line with a run kept at each end, and straightens it back', () => {
    const straight = ends([100, 50, 'right'], [300, 50, 'left']);
    const flat = connectionPath('square', straight).corners;
    expect(moveSegment(straight, flat, 0, { x: 200, y: 90 })).toEqual([
      { x: 120, y: 50 },
      { x: 120, y: 90 },
      { x: 280, y: 90 },
      { x: 280, y: 50 },
    ]);
    expect(moveSegment(straight, flat, 0, { x: 200, y: 50 })).toEqual([]);
  });

  it('gives points that draw the same line again', () => {
    const points = moveSegment(across, line, 0, { x: 150, y: 20 });
    expect(connectionPath('square', across, points).corners).toEqual([
      { x: 100, y: 50 },
      ...points,
      { x: 300, y: 150 },
    ]);
  });
});

describe('connectionPath, right angles', () => {
  it('makes three segments between sides that face each other, crossing over halfway', () => {
    const shape = connectionPath('square', ends([100, 50, 'right'], [300, 150, 'left']));
    expect(corners(shape.path)).toEqual([
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 150 },
      { x: 300, y: 150 },
    ]);
    expect(shape.midpoints[1]).toEqual({ x: 200, y: 100 });
    expect(shape.labelX).toBe(200);
    expect(shape.labelY).toBe(100);
  });

  it('reads the crossing segment of an older route moved along its one direction only', () => {
    const vertical = ends([50, 100, 'bottom'], [150, 300, 'top']);
    const moved = connectionPath('square', vertical, bent(vertical, { x: 500, y: -30 }));
    expect(corners(moved.path)[1]).toEqual({ x: 50, y: 170 });
  });

  it('keeps the crossing segment of an older route clear of both sides', () => {
    const base = ends([100, 50, 'right'], [300, 150, 'left']);
    const far = connectionPath('square', base, bent(base, { x: 1000, y: 0 }));
    expect(corners(far.path)[1]?.x).toBe(300 - 12);
    const near = connectionPath('square', base, bent(base, { x: -1000, y: 0 }));
    expect(corners(near.path)[1]?.x).toBe(100 + 12);
  });

  it('turns at the points it is routed through, adding the corners it needs', () => {
    const base = ends([100, 50, 'right'], [300, 150, 'left']);
    expect(connectionPath('square', base, [{ x: 200, y: 100 }]).corners).toEqual([
      { x: 100, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 150 },
      { x: 300, y: 150 },
    ]);
    // A point behind the source: out a short run first, then round to it, at right angles.
    const behind = connectionPath('square', base, [{ x: 50, y: 200 }]).corners;
    expect(behind[1]).toEqual({ x: 120, y: 50 });
    expect(behind).toContainEqual({ x: 50, y: 200 });
    expect(rightAngled(behind)).toBe(true);
    expect(behind[behind.length - 1]).toEqual({ x: 300, y: 150 });
  });

  it('goes round when both sides face the same way, with the channel beyond both nodes', () => {
    const same = ends([100, 50, 'right'], [160, 150, 'right']);
    expect(corners(connectionPath('square', same).path)).toEqual([
      { x: 100, y: 50 },
      { x: 180, y: 50 },
      { x: 180, y: 150 },
      { x: 160, y: 150 },
    ]);
    const moved = connectionPath('square', same, bent(same, { x: 60, y: 0 }));
    expect(corners(moved.path)[1]?.x).toBe(240);
  });

  it('makes a single corner between sides on different axes', () => {
    const shape = connectionPath('square', ends([100, 50, 'right'], [300, 150, 'top']));
    expect(corners(shape.path)).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 150 },
    ]);
    expect(shape.midpoints).toHaveLength(2);
  });

  it('detours when a corner would make the line turn back on a node', () => {
    // Leaving by the right towards a target on its left, arriving at its top from above.
    const shape = connectionPath('square', ends([300, 50, 'right'], [100, 40, 'top']));
    const turns = corners(shape.path);
    expect(turns.length).toBeGreaterThan(3);
    expect(turns[0]).toEqual({ x: 300, y: 50 });
    expect(turns[turns.length - 1]).toEqual({ x: 100, y: 40 });
  });

  it('goes across a lane when the sides face each other but the nodes overlap', () => {
    const overlap = ends([300, 50, 'right'], [100, 150, 'left']);
    const turns = corners(connectionPath('square', overlap).path);
    expect(turns.map((point) => point.x)).toEqual([300, 320, 320, 80, 80, 100]);
    expect(turns[1]?.y).toBe(turns[0]?.y);
    const lowered = connectionPath('square', overlap, bent(overlap, { x: 70, y: 60 }));
    expect(corners(lowered.path)[2]?.y).toBe(160);
  });

  it('is a straight line between aligned nodes, which can still be moved', () => {
    const shape = connectionPath('square', ends([100, 50, 'right'], [300, 50, 'left']));
    expect(shape.path).toBe('M 100 50 L 300 50');
    expect(shape.midpoints).toEqual([{ x: 200, y: 50 }]);
  });

  it('swings out sideways when aligned nodes cannot see each other through their sides', () => {
    // Both sides face right on one line: out, round the end of the target and back in, not through it.
    const shape = connectionPath('square', ends([100, 50, 'right'], [160, 50, 'right']));
    expect(corners(shape.path)).toEqual([
      { x: 100, y: 50 },
      { x: 120, y: 50 },
      { x: 120, y: 90 },
      { x: 180, y: 90 },
      { x: 180, y: 50 },
      { x: 160, y: 50 },
    ]);
  });

  it('rounds each corner with the radius, less when the segments are short', () => {
    const wide = connectionPath('square', ends([0, 0, 'right'], [200, 100, 'left']));
    expect(wide.path).toContain(`L ${100 - CORNER_RADIUS} 0 Q 100 0 100 ${CORNER_RADIUS}`);
    const tight = connectionPath('square', ends([0, 0, 'right'], [200, 4, 'left']));
    expect(tight.path).toContain('Q 100 0 100 2');
  });

  it.each(['left', 'right', 'top', 'bottom'] as const)(
    'arrives straight into a target side that faces %s',
    (side) => {
      // Wherever the source is, the last segment runs straight into the side, against its outward direction.
      const target = { x: 400, y: 300 };
      for (const [sx, sy, from] of [
        [100, 300, 'right'],
        [400, 100, 'bottom'],
        [700, 300, 'left'],
        [400, 500, 'top'],
        [100, 100, 'right'],
        [700, 500, 'top'],
      ] as const) {
        const line = ends([sx, sy, from], [target.x, target.y, side]);
        for (const points of [bent(line, { x: 7, y: 7 }), [{ x: 250, y: 420 }]]) {
          const turns = corners(connectionPath('square', line, points).path);
          const last = turns[turns.length - 1];
          const before = turns[turns.length - 2];
          expect(last).toEqual(target);
          if (!before || !last) continue;
          const out = OUTWARD[side];
          // The final run goes along the axis of the side, coming from outside the node.
          expect(Math.sign(before.x - last.x)).toBe(out.x === 0 ? 0 : Math.sign(out.x));
          expect(Math.sign(before.y - last.y)).toBe(out.y === 0 ? 0 : Math.sign(out.y));
          expect(rightAngled(turns)).toBe(true);
        }
      }
    },
  );
});
