import {
  ARCHITECTURE_TEMPLATES,
  type EdgeStyle,
  type Point,
  TEMPLATE_IDS,
} from '@archdraft/shared';
import { describe, expect, it } from 'vitest';
import { connectionPath } from '../src/canvas/edge-path.ts';
import { toFlow } from '../src/canvas/flow.ts';
import { arrowhead, type Box, type EdgeSides } from '../src/canvas/geometry.ts';
import { computeLayout } from '../src/layout/compute-layout.ts';

/** Points along SVG path data made of the M, L, Q and C commands the canvas draws. */
function sample(path: string): Point[] {
  const tokens = path.replace(/,/g, ' ').match(/[MLQC]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const points: Point[] = [];
  let current: Point = { x: 0, y: 0 };
  let index = 0;
  const next = (): Point => {
    const x = Number(tokens[index++]);
    const y = Number(tokens[index++]);
    return { x, y };
  };
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === 'M' || command === 'L') {
      const to = next();
      if (command === 'L') for (let t = 0.02; t <= 1; t += 0.02) points.push(lerp(current, to, t));
      else points.push(to);
      current = to;
    } else if (command === 'Q') {
      const control = next();
      const to = next();
      for (let t = 0.02; t <= 1; t += 0.02) {
        const a = lerp(current, control, t);
        points.push(lerp(a, lerp(control, to, t), t));
      }
      current = to;
    } else if (command === 'C') {
      const first = next();
      const second = next();
      const to = next();
      for (let t = 0.02; t <= 1; t += 0.02) {
        const a = lerp(current, first, t);
        const b = lerp(first, second, t);
        const c = lerp(second, to, t);
        points.push(lerp(lerp(a, b, t), lerp(b, c, t), t));
      }
      current = to;
    } else {
      throw new Error(`Unexpected path command ${command} in ${path}`);
    }
  }
  return points;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Whether the point is inside the box, more than a pixel in from its edges. */
function inside(point: Point, box: Box): boolean {
  return (
    point.x > box.x + 1 &&
    point.x < box.x + box.width - 1 &&
    point.y > box.y + 1 &&
    point.y < box.y + box.height - 1
  );
}

/** The connections of a template, drawn as the canvas draws them at rest, that cross a node they do not join. */
async function crossings(id: (typeof TEMPLATE_IDS)[number], style: EdgeStyle): Promise<string[]> {
  const graph = ARCHITECTURE_TEMPLATES[id];
  const layout = { ...(await computeLayout(graph)), edgeStyle: style };
  const { edges } = toFlow({ graph, layout }, 'LR');
  const found: string[] = [];
  for (const edge of edges) {
    const data = edge.data;
    if (!data) continue;
    const sides = { source: edge.sourceHandle, target: edge.targetHandle } as EdgeSides;
    const start = data.edge.bidirectional
      ? arrowhead(data.sourcePoint.x, data.sourcePoint.y, sides.source).base
      : data.sourcePoint;
    const tip = arrowhead(data.targetPoint.x, data.targetPoint.y, sides.target).base;
    const shape = connectionPath(
      style,
      {
        sourceX: start.x,
        sourceY: start.y,
        targetX: tip.x,
        targetY: tip.y,
        sourcePosition: sides.source,
        targetPosition: sides.target,
      },
      [],
      data.obstacles,
    );
    const foreign = data.obstacles.filter(
      (box) => box !== data.sourceBox && box !== data.targetBox,
    );
    const points = sample(shape.path);
    for (const box of foreign) {
      if (points.some((point) => inside(point, box))) found.push(edge.id);
    }
  }
  return found;
}

describe('template connections', () => {
  for (const style of ['square', 'curved'] as const) {
    it.each(TEMPLATE_IDS)(`${style}: %s crosses no node it does not join`, async (id) => {
      expect(await crossings(id, style)).toEqual([]);
    });
  }
});
