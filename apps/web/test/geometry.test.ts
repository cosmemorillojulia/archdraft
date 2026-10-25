import type { ArchitectureGraph, DiagramLayout } from '@archdraft/core';
import { describe, expect, it } from 'vitest';
import {
  absoluteBoxes,
  ARROW_LENGTH,
  ARROW_WIDTH,
  arrowhead,
  boundsOf,
  drawingScale,
  initialViewport,
  nestingDepths,
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
