import type { Point } from '@archdraft/shared';
import { describe, expect, it } from 'vitest';
import type { Box } from '../src/canvas/geometry.ts';
import { routeAround } from '../src/canvas/router.ts';

const box = (x: number, y: number, width = 180, height = 64): Box => ({ x, y, width, height });

/** Whether a right-angled line goes through the inside of the box. */
function crosses(corners: readonly Point[], target: Box): boolean {
  return corners.slice(1).some((to, index) => {
    const from = corners[index] as Point;
    return (
      Math.max(from.x, to.x) > target.x &&
      Math.min(from.x, to.x) < target.x + target.width &&
      Math.max(from.y, to.y) > target.y &&
      Math.min(from.y, to.y) < target.y + target.height
    );
  });
}

function rightAngled(corners: readonly Point[]): boolean {
  return corners
    .slice(1)
    .every(
      (to, index) => to.x === (corners[index] as Point).x || to.y === (corners[index] as Point).y,
    );
}

describe('routes round the nodes', () => {
  const source = box(0, 0);
  const target = box(600, 0);
  const from = { x: 180, y: 32 };
  const to = { x: 591, y: 32 };

  it('goes straight when nothing is in the way', () => {
    const route = routeAround(from, 'right', to, 'left', [source, target]);
    expect(route?.corners).toEqual([from, to]);
  });

  it('goes round a node between the two ends, at right angles', () => {
    const between = box(300, -10, 180, 84);
    const route = routeAround(from, 'right', to, 'left', [source, target, between]);
    expect(route).not.toBeNull();
    const corners = route?.corners ?? [];
    expect(corners[0]).toEqual(from);
    expect(corners[corners.length - 1]).toEqual(to);
    expect(rightAngled(corners)).toBe(true);
    expect(crosses(corners, between)).toBe(false);
  });

  it('does not cross its own nodes when the sides face away', () => {
    // Leaving by the left of the source towards a target on its right.
    const start = { x: 0, y: 32 };
    const route = routeAround(start, 'left', to, 'left', [source, target]);
    const corners = route?.corners ?? [];
    expect(corners.length).toBeGreaterThan(2);
    expect(crosses(corners.slice(1), source)).toBe(false);
  });

  it('runs down the middle of a gap rather than along a node', () => {
    // A target below and to the right: the line turns down halfway between the two columns.
    const below = box(600, 300);
    const route = routeAround(from, 'right', { x: 600, y: 323 }, 'left', [source, below]);
    const corners = route?.corners ?? [];
    expect(corners).toHaveLength(4);
    expect((corners[1] as Point).x).toBeCloseTo((180 + 600 - 9) / 2, -1);
  });
});
