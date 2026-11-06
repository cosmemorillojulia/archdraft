import { type ArchitectureGraph, createEmptyGraph, type DiagramLayout } from '@archdraft/shared';
import { describe, expect, it } from 'vitest';
import { placeEdges, straightened } from '../src/canvas/edge-layout.ts';
import { absoluteBoxes, snapped, SNAP_DISTANCE } from '../src/canvas/geometry.ts';

const box = (x: number, y: number, width = 160, height = 60) => ({ x, y, width, height });
const across = { source: 'right', target: 'left' } as const;

describe('straightened', () => {
  it('meets in the middle when both ends have their side to themselves', () => {
    const result = straightened(
      { box: box(0, 0), point: { x: 160, y: 30 }, movable: true },
      { box: box(300, 16), point: { x: 300, y: 46 }, movable: true },
      across,
    );
    expect(result).toEqual({ source: { x: 160, y: 38 }, target: { x: 300, y: 38 } });
  });

  it('moves only the end that has its side to itself', () => {
    const result = straightened(
      { box: box(0, 0), point: { x: 160, y: 30 }, movable: false },
      { box: box(300, 16), point: { x: 300, y: 46 }, movable: true },
      across,
    );
    expect(result).toEqual({ source: { x: 160, y: 30 }, target: { x: 300, y: 30 } });
  });

  it('works up and down too', () => {
    const result = straightened(
      { box: box(0, 0), point: { x: 80, y: 60 }, movable: true },
      { box: box(10, 200), point: { x: 90, y: 200 }, movable: true },
      { source: 'bottom', target: 'top' },
    );
    expect(result).toEqual({ source: { x: 85, y: 60 }, target: { x: 85, y: 200 } });
  });

  it('leaves ends that are far apart, that share their sides, that do not face, or past a corner', () => {
    const from = { box: box(0, 0), point: { x: 160, y: 30 }, movable: true };
    const far = { box: box(300, 60), point: { x: 300, y: 90 }, movable: true };
    expect(straightened(from, far, across)).toEqual({ source: from.point, target: far.point });
    const shared = { box: box(300, 16), point: { x: 300, y: 46 }, movable: false };
    expect(straightened({ ...from, movable: false }, shared, across)).toEqual({
      source: from.point,
      target: shared.point,
    });
    expect(
      straightened(from, { ...shared, movable: true }, { source: 'right', target: 'top' }),
    ).toEqual({ source: from.point, target: shared.point });
    // Lining up with the other end would put this one on the corner of a small box.
    const small = { box: box(300, 40, 160, 20), point: { x: 300, y: 50 }, movable: true };
    expect(straightened({ ...from, movable: false }, small, across)).toEqual({
      source: from.point,
      target: small.point,
    });
  });
});

describe('placeEdges', () => {
  it('draws a straight connection between two boxes that are nearly level', () => {
    const graph: ArchitectureGraph = {
      ...createEmptyGraph('Two'),
      nodes: [
        { id: 'cdn', kind: 'cdn', label: 'CDN' },
        { id: 'store', kind: 'object-storage', label: 'Store' },
      ],
      edges: [{ id: 'cdn-store', source: 'cdn', target: 'store' }],
    };
    const layout: DiagramLayout = {
      positions: { cdn: { x: 0, y: 0 }, store: { x: 400, y: 14 } },
      sizes: { cdn: { width: 200, height: 80 }, store: { width: 200, height: 80 } },
    };
    const { placements } = placeEdges(graph, absoluteBoxes(graph, layout), layout, 'LR');
    const placement = placements.get('cdn-store');
    expect(placement?.source.y).toBe(placement?.target.y);
  });
});

describe('snapped', () => {
  const size = { width: 100, height: 40 };

  it('pulls a node level with a neighbour that is close, across and along', () => {
    // Centre at (50, 20); the neighbour at (54, 300) and another at (400, 14).
    expect(
      snapped({ x: 0, y: 0 }, size, { x: 0, y: 0 }, [
        { x: 54, y: 300 },
        { x: 400, y: 14 },
      ]),
    ).toEqual({
      x: 4,
      y: -6,
    });
  });

  it('counts the place of the group, and leaves a node that is not close', () => {
    expect(snapped({ x: 10, y: 10 }, size, { x: 100, y: 100 }, [{ x: 163, y: 134 }])).toEqual({
      x: 13,
      y: 14,
    });
    const far = SNAP_DISTANCE + 1;
    expect(snapped({ x: 0, y: 0 }, size, { x: 0, y: 0 }, [{ x: 50 + far, y: 20 + far }])).toEqual({
      x: 0,
      y: 0,
    });
  });
});
