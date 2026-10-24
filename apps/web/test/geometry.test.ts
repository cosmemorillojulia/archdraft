import type { ArchitectureGraph, DiagramLayout } from '@archdraft/core';
import { describe, expect, it } from 'vitest';
import {
  absoluteBoxes,
  boundsOf,
  curveMidpoint,
  curvePath,
  curveSpan,
  edgeCurve,
  truncate,
} from '../src/diagram/geometry.ts';

const edgePath = (
  source: Parameters<typeof edgeCurve>[0],
  target: Parameters<typeof edgeCurve>[1],
) => curvePath(edgeCurve(source, target));

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

describe('edgeCurve', () => {
  const left = { x: 0, y: 0, width: 100, height: 40 };

  it('joins facing sides when the target is to the right', () => {
    expect(edgePath(left, { x: 200, y: 100, width: 100, height: 40 })).toBe(
      'M 100 20 C 150 20 150 120 200 120',
    );
  });

  it('joins facing sides when the target is to the left', () => {
    expect(edgePath({ x: 200, y: 0, width: 100, height: 40 }, left)).toBe(
      'M 200 20 C 150 20 150 20 100 20',
    );
  });

  it('joins bottom to top when the boxes overlap horizontally', () => {
    expect(edgePath(left, { x: 20, y: 140, width: 100, height: 40 })).toBe(
      'M 50 40 C 50 90 70 90 70 140',
    );
  });

  it('joins top to bottom when the target is above', () => {
    expect(edgePath({ x: 20, y: 140, width: 100, height: 40 }, left)).toBe(
      'M 70 140 C 70 90 50 90 50 40',
    );
  });
});

describe('curveMidpoint and curveSpan', () => {
  const curve = edgeCurve(
    { x: 0, y: 0, width: 100, height: 40 },
    { x: 200, y: 100, width: 100, height: 40 },
  );

  it('places the midpoint halfway between the ends of a symmetric curve', () => {
    expect(curveMidpoint(curve)).toEqual({ x: 150, y: 70 });
  });

  it('measures the distance between the ends', () => {
    expect(curveSpan(curve)).toBeCloseTo(Math.hypot(100, 100));
  });
});

describe('truncate', () => {
  it('keeps short text and shortens long text with an ellipsis', () => {
    expect(truncate('Cache', 10)).toBe('Cache');
    expect(truncate('Conversation history', 10)).toBe('Conversat…');
  });
});
