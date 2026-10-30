import type { ArchitectureGraph, DiagramLayout } from '@archdraft/core';
import { describe, expect, it } from 'vitest';
import {
  absoluteBoxes,
  ARROW_LENGTH,
  ARROW_WIDTH,
  arrowhead,
  boundsOf,
  drawingScale,
  edgeSides,
  initialViewport,
  nearestSide,
  nestingDepths,
  sidePoint,
} from '../src/canvas/geometry.ts';

const graph: ArchitectureGraph = {
  schemaVersion: 1,
  title: 'Nested',
  provider: 'aws',
  nodes: [
    { id: 'region', kind: 'region', label: 'Region' },
    { id: 'vpc', kind: 'network', label: 'VPC', parentId: 'region' },
    { id: 'api', kind: 'service', label: 'API', parentId: 'vpc' },
    { id: 'user', kind: 'user', label: 'User' },
  ],
  edges: [],
};

const layout: DiagramLayout = {
  positions: {
    region: { x: 100, y: 50 },
    vpc: { x: 10, y: 20 },
    api: { x: 5, y: 7 },
    user: { x: 0, y: 0 },
  },
  sizes: {
    region: { width: 400, height: 300 },
    vpc: { width: 300, height: 200 },
    api: { width: 180, height: 64 },
    user: { width: 180, height: 64 },
  },
};

describe('absoluteBoxes', () => {
  it('adds the positions of every ancestor container', () => {
    const boxes = absoluteBoxes(graph, layout);
    expect(boxes.get('vpc')).toEqual({ x: 110, y: 70, width: 300, height: 200 });
    expect(boxes.get('api')).toEqual({ x: 115, y: 77, width: 180, height: 64 });
    expect(boxes.get('user')).toEqual({ x: 0, y: 0, width: 180, height: 64 });
  });

  it('leaves out nodes without layout and their descendants', () => {
    const { vpc: _vpc, ...positions } = layout.positions;
    const boxes = absoluteBoxes(graph, { ...layout, positions });
    expect(boxes.has('vpc')).toBe(false);
    expect(boxes.has('api')).toBe(false);
    expect(boxes.has('region')).toBe(true);
  });
});

describe('nestingDepths', () => {
  it('counts the containers around each node', () => {
    expect(Object.fromEntries(nestingDepths(graph))).toEqual({
      region: 0,
      vpc: 1,
      api: 2,
      user: 0,
    });
  });
});

describe('drawingScale', () => {
  const limits = { min: 0.9, max: 1.5 };

  it('fits the diagram when that keeps it readable', () => {
    expect(drawingScale({ width: 1000, height: 500 }, { width: 950, height: 900 }, limits)).toBe(
      0.95,
    );
  });

  it('keeps the minimum scale when fitting would shrink the text too much', () => {
    expect(drawingScale({ width: 1000, height: 500 }, { width: 390, height: 600 }, limits)).toBe(
      0.9,
    );
  });

  it('does not enlarge small diagrams beyond the maximum', () => {
    expect(drawingScale({ width: 100, height: 100 }, { width: 1000, height: 1000 }, limits)).toBe(
      1.5,
    );
  });
});

describe('boundsOf', () => {
  it('returns the box that contains all boxes', () => {
    expect(
      boundsOf([
        { x: 10, y: 20, width: 30, height: 40 },
        { x: -5, y: 50, width: 10, height: 10 },
      ]),
    ).toEqual({ x: -5, y: 20, width: 45, height: 40 });
  });

  it('returns null without boxes', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('initialViewport', () => {
  const insets = { top: 100, right: 20, bottom: 150, left: 20 };
  const limits = { min: 0.9, max: 1.2 };

  it('centres and fits a diagram that fits at a readable zoom', () => {
    const viewport = initialViewport(
      { x: 0, y: 0, width: 960, height: 500 },
      { width: 1240, height: 850 },
      insets,
      limits,
    );
    expect(viewport.zoom).toBe(1.2);
    expect(viewport.x).toBe(20 + (1200 - 960 * 1.2) / 2);
    expect(viewport.y).toBe(100 + (600 - 500 * 1.2) / 2);
  });

  it('keeps a readable zoom on a small screen and starts at the top', () => {
    const viewport = initialViewport(
      { x: 40, y: 60, width: 1000, height: 1100 },
      { width: 390, height: 700 },
      insets,
      limits,
    );
    expect(viewport.zoom).toBe(0.9);
    expect(viewport.y).toBe(100 - 60 * 0.9);
    expect(viewport.x).toBe(20 + (350 - 1000 * 0.9) / 2 - 40 * 0.9);
  });
});

describe('arrowhead', () => {
  it('ends the line one arrow length before the target, on the side it arrives from', () => {
    expect(arrowhead(100, 50, 'left').base).toEqual({ x: 100 - ARROW_LENGTH, y: 50 });
    expect(arrowhead(100, 50, 'right').base).toEqual({ x: 100 + ARROW_LENGTH, y: 50 });
    expect(arrowhead(100, 50, 'top').base).toEqual({ x: 100, y: 50 - ARROW_LENGTH });
    expect(arrowhead(100, 50, 'bottom').base).toEqual({ x: 100, y: 50 + ARROW_LENGTH });
  });

  it('draws a triangle across the base with its tip on the target', () => {
    const half = ARROW_WIDTH / 2;
    const base = 100 - ARROW_LENGTH;
    expect(arrowhead(100, 50, 'left').outline).toBe(
      `M ${base} ${50 + half} L 100 50 L ${base} ${50 - half} Z`,
    );
    const top = 50 - ARROW_LENGTH;
    expect(arrowhead(100, 50, 'top').outline).toBe(
      `M ${100 - half} ${top} L 100 50 L ${100 + half} ${top} Z`,
    );
  });
});

describe('edgeSides', () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 50 });

  it('goes across, from the right to the left, to a node further along', () => {
    expect(edgeSides(box(0, 0), box(200, 0), 'LR')).toEqual({ source: 'right', target: 'left' });
  });

  it('goes down, from the bottom to the top, to a node right below', () => {
    expect(edgeSides(box(0, 0), box(0, 150), 'LR')).toEqual({ source: 'bottom', target: 'top' });
  });

  it('goes down when the target is mostly below, even if a little to the side', () => {
    expect(edgeSides(box(0, 0), box(40, 200), 'TB')).toEqual({ source: 'bottom', target: 'top' });
  });

  it('always leaves by the right or the bottom and arrives at the left or the top', () => {
    const others = [
      box(-300, 0),
      box(300, 0),
      box(0, -200),
      box(0, 200),
      box(-250, -150),
      box(250, 150),
    ];
    for (const direction of ['LR', 'RL', 'TB', 'BT'] as const) {
      for (const other of others) {
        const sides = edgeSides(box(0, 0), other, direction);
        expect(['right', 'bottom']).toContain(sides.source);
        expect(['left', 'top']).toContain(sides.target);
      }
    }
  });
});

describe('edgeSides with sides chosen by hand', () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 50 });

  it('keeps the side that was chosen, whatever the nodes are like', () => {
    expect(edgeSides(box(0, 0), box(300, 0), 'LR', { source: 'top' }).source).toBe('top');
    expect(edgeSides(box(0, 0), box(300, 0), 'LR', { target: 'bottom' }).target).toBe('bottom');
    expect(edgeSides(box(0, 0), box(300, 0), 'LR', { source: 'left', target: 'right' })).toEqual({
      source: 'left',
      target: 'right',
    });
  });

  it('leaves the other end the side that makes the shortest line, on any of the four', () => {
    // Leaving by the bottom towards a target far above, the line arrives by the top or the bottom side nearest it.
    const sides = edgeSides(box(0, 300), box(0, 0), 'LR', { source: 'top' });
    expect(sides).toEqual({ source: 'top', target: 'bottom' });
    // A target to the left of the source is reached by its right side, which the default never uses.
    expect(edgeSides(box(300, 0), box(0, 0), 'LR', { source: 'left' })).toEqual({
      source: 'left',
      target: 'right',
    });
  });

  it('is the automatic choice when nothing was chosen', () => {
    expect(edgeSides(box(0, 0), box(200, 0), 'LR', {})).toEqual(
      edgeSides(box(0, 0), box(200, 0), 'LR'),
    );
  });
});

describe('nearestSide', () => {
  const b = { x: 100, y: 100, width: 200, height: 60 };

  it('is the side a point outside the node is closest to', () => {
    expect(nearestSide(b, { x: 200, y: 40 })).toBe('top');
    expect(nearestSide(b, { x: 200, y: 220 })).toBe('bottom');
    expect(nearestSide(b, { x: 20, y: 130 })).toBe('left');
    expect(nearestSide(b, { x: 380, y: 130 })).toBe('right');
  });

  it('is the closest border for a point inside the node', () => {
    expect(nearestSide(b, { x: 110, y: 130 })).toBe('left');
    expect(nearestSide(b, { x: 200, y: 105 })).toBe('top');
    expect(nearestSide(b, { x: 290, y: 130 })).toBe('right');
    expect(nearestSide(b, { x: 200, y: 155 })).toBe('bottom');
  });

  it('follows the border past the corners, not the middle of the sides', () => {
    // Above the left end of a wide node is still closer to its top than to its left side.
    expect(nearestSide(b, { x: 110, y: 90 })).toBe('top');
    expect(nearestSide(b, { x: 80, y: 130 })).toBe('left');
  });
});

describe('sidePoint', () => {
  it('is the middle of each side', () => {
    const b = { x: 10, y: 20, width: 100, height: 40 };
    expect(sidePoint(b, 'left')).toEqual({ x: 10, y: 40 });
    expect(sidePoint(b, 'right')).toEqual({ x: 110, y: 40 });
    expect(sidePoint(b, 'top')).toEqual({ x: 60, y: 20 });
    expect(sidePoint(b, 'bottom')).toEqual({ x: 60, y: 60 });
  });
});
