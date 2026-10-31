import { describe, expect, it } from 'vitest';
import { type ConnectionEnds, connectionPath, CORNER_RADIUS } from '../src/canvas/edge-path.ts';
import { OUTWARD, type Side } from '../src/canvas/geometry.ts';

const ends = (source: [number, number, Side], target: [number, number, Side]): ConnectionEnds => ({
  sourceX: source[0],
  sourceY: source[1],
  sourcePosition: source[2],
  targetX: target[0],
  targetY: target[1],
  targetPosition: target[2],
});

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

describe('connectionPath, curved', () => {
  const across = ends([100, 50, 'right'], [300, 150, 'left']);

  it('is the default curve without a bend, and the handle of the middle sits on it', () => {
    const shape = connectionPath('curved', across);
    expect(shape.path).toMatch(/^M ?100,?50 ?C/);
    expect(shape.bend).toEqual({ x: shape.labelX, y: shape.labelY, axes: 'both' });
    expect(connectionPath('curved', across, { x: 0, y: 0 }).path).toBe(shape.path);
  });

  it('passes through the middle moved by the bend, and puts the label there', () => {
    const home = connectionPath('curved', across);
    const bent = connectionPath('curved', across, { x: 10, y: -80 });
    const through = { x: home.labelX + 10, y: home.labelY - 80 };
    expect(bent.labelX).toBeCloseTo(through.x);
    expect(bent.labelY).toBeCloseTo(through.y);
    expect(bent.bend).toEqual({ ...through, axes: 'both' });
    // The curve is made of two parts that meet at the moved point.
    const numbers = pointsOf(bent.path);
    expect(numbers).toHaveLength(7);
    expect(numbers[3]).toEqual(through);
  });

  it('still leaves its side and reaches the other one in a straight line', () => {
    for (const bend of [
      { x: 0, y: 90 },
      { x: -40, y: -60 },
      { x: 150, y: 0 },
    ]) {
      const p = pointsOf(connectionPath('curved', across, bend).path);
      // First control point straight out of the right side, last straight into the left one.
      expect(p[1]?.y).toBeCloseTo(50);
      expect(p[1]?.x).toBeGreaterThan(100);
      expect(p[5]?.y).toBeCloseTo(150);
      expect(p[5]?.x).toBeLessThan(300);
    }
  });

  it('copes with a bend on top of an end', () => {
    expect(() => connectionPath('curved', across, { x: -300, y: 100 })).not.toThrow();
    const shape = connectionPath('curved', ends([0, 0, 'right'], [0, 0, 'left']), { x: 5, y: 5 });
    expect(shape.path).not.toContain('NaN');
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
    expect(shape.bend).toEqual({ x: 200, y: 100, axes: 'x' });
    expect(shape.labelX).toBe(200);
    expect(shape.labelY).toBe(100);
  });

  it('moves the crossing segment with the bend, along its one direction only', () => {
    const base = ends([100, 50, 'right'], [300, 150, 'left']);
    const moved = connectionPath('square', base, { x: 40, y: 500 });
    expect(corners(moved.path)[1]).toEqual({ x: 240, y: 50 });
    expect(moved.bend).toEqual({ x: 240, y: 100, axes: 'x' });
    const vertical = connectionPath('square', ends([50, 100, 'bottom'], [150, 300, 'top']), {
      x: 500,
      y: -30,
    });
    expect(corners(vertical.path)[1]).toEqual({ x: 50, y: 170 });
    expect(vertical.bend?.axes).toBe('y');
  });

  it('keeps the crossing segment clear of both sides', () => {
    const base = ends([100, 50, 'right'], [300, 150, 'left']);
    const far = connectionPath('square', base, { x: 1000, y: 0 });
    expect(corners(far.path)[1]?.x).toBe(300 - 12);
    const near = connectionPath('square', base, { x: -1000, y: 0 });
    expect(corners(near.path)[1]?.x).toBe(100 + 12);
  });

  it('goes round when both sides face the same way, with the channel beyond both nodes', () => {
    const shape = connectionPath('square', ends([100, 50, 'right'], [160, 150, 'right']));
    expect(corners(shape.path)).toEqual([
      { x: 100, y: 50 },
      { x: 180, y: 50 },
      { x: 180, y: 150 },
      { x: 160, y: 150 },
    ]);
    expect(shape.bend?.axes).toBe('x');
    const moved = connectionPath('square', ends([100, 50, 'right'], [160, 150, 'right']), {
      x: 60,
      y: 0,
    });
    expect(corners(moved.path)[1]?.x).toBe(240);
  });

  it('makes a single corner between sides on different axes, with nothing in the middle to move', () => {
    const shape = connectionPath('square', ends([100, 50, 'right'], [300, 150, 'top']));
    expect(corners(shape.path)).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 150 },
    ]);
    expect(shape.bend).toBeNull();
    expect(
      connectionPath('square', ends([100, 50, 'right'], [300, 150, 'top']), { x: 90, y: 90 }).path,
    ).toBe(shape.path);
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
    const shape = connectionPath('square', ends([300, 50, 'right'], [100, 150, 'left']));
    const turns = corners(shape.path);
    expect(turns.map((point) => point.x)).toEqual([300, 320, 320, 80, 80, 100]);
    expect(turns[1]?.y).toBe(turns[0]?.y);
    expect(shape.bend?.axes).toBe('y');
    const lowered = connectionPath('square', ends([300, 50, 'right'], [100, 150, 'left']), {
      x: 70,
      y: 60,
    });
    expect(corners(lowered.path)[2]?.y).toBe(160);
  });

  it('is a straight line, with nothing to move, between aligned nodes', () => {
    const shape = connectionPath('square', ends([100, 50, 'right'], [300, 50, 'left']));
    expect(shape.path).toBe('M 100 50 L 300 50');
    expect(shape.bend).toBeNull();
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
        const shape = connectionPath('square', ends([sx, sy, from], [target.x, target.y, side]), {
          x: 7,
          y: 7,
        });
        const turns = corners(shape.path);
        const last = turns[turns.length - 1];
        const before = turns[turns.length - 2];
        expect(last).toEqual(target);
        if (!before || !last) continue;
        const out = OUTWARD[side];
        // The final run goes along the axis of the side, coming from outside the node.
        expect(Math.sign(before.x - last.x)).toBe(out.x === 0 ? 0 : Math.sign(out.x));
        expect(Math.sign(before.y - last.y)).toBe(out.y === 0 ? 0 : Math.sign(out.y));
        for (let i = 1; i < turns.length; i++) {
          const a = turns[i - 1];
          const b = turns[i];
          expect(a && b && (a.x === b.x || a.y === b.y)).toBe(true);
        }
      }
    },
  );
});
