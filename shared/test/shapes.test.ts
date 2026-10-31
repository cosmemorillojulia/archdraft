import { describe, expect, it } from 'vitest';
import {
  type ArchitectureGraph,
  DEFAULT_CONTAINER_SIZE,
  DEFAULT_NODE_SIZE,
  defaultSizeOf,
  getNodeDefinition,
  isShapeKind,
  lintGraph,
  SHAPE_KINDS,
  SHAPE_SIZES,
  toDrawio,
  toMermaid,
  validateGraph,
} from '../src/index.ts';

/** A small flowchart: start, step, decision that loops back, and a note. */
const flow: ArchitectureGraph = {
  schemaVersion: 1,
  title: 'Approval flow',
  provider: 'generic',
  nodes: [
    { id: 'start', kind: 'circle', label: 'Start' },
    { id: 'review', kind: 'box', label: 'Review request' },
    { id: 'ok', kind: 'diamond', label: 'Approved?' },
    { id: 'tip', kind: 'note', label: 'Reviews take a day' },
  ],
  edges: [
    { id: 'start-review', source: 'start', target: 'review' },
    { id: 'review-ok', source: 'review', target: 'ok' },
    { id: 'ok-review', source: 'ok', target: 'review', label: 'no' },
  ],
};

describe('shapes', () => {
  it('are plain figures of their own category', () => {
    expect(SHAPE_KINDS).toEqual(['box', 'circle', 'diamond', 'note', 'text']);
    for (const kind of SHAPE_KINDS) {
      expect(isShapeKind(kind)).toBe(true);
      expect(getNodeDefinition(kind)).toMatchObject({ category: 'shape', services: {} });
    }
    expect(isShapeKind('service')).toBe(false);
  });

  it('have their own default size', () => {
    expect(defaultSizeOf('circle')).toEqual(SHAPE_SIZES.circle);
    expect(defaultSizeOf('service')).toEqual(DEFAULT_NODE_SIZE);
    expect(defaultSizeOf('network')).toEqual(DEFAULT_CONTAINER_SIZE);
  });

  it('form valid graphs, loops included', () => {
    expect(validateGraph(flow)).toEqual([]);
  });

  it('are ignored by the design rules: no orphan note, no synchronous cycle', () => {
    expect(lintGraph(flow)).toEqual([]);
  });

  it('do not lengthen request paths between components', () => {
    const graph: ArchitectureGraph = {
      ...flow,
      nodes: [
        ...flow.nodes,
        { id: 'user', kind: 'user', label: 'User' },
        { id: 'api', kind: 'service', label: 'API', attributes: { replicas: 2 } },
      ],
      edges: [
        ...flow.edges,
        { id: 'user-start', source: 'user', target: 'start' },
        { id: 'ok-api', source: 'ok', target: 'api' },
        { id: 'api-ok', source: 'api', target: 'ok' },
      ],
    };
    expect(lintGraph(graph).map((finding) => finding.ruleId)).toEqual([]);
  });

  it('keep their outline in Mermaid, without a subtitle', () => {
    const text = toMermaid(flow);
    expect(text).toContain('(("Start"))');
    expect(text).toContain('["Review request"]');
    expect(text).toContain('{"Approved?"}');
    expect(text).toContain('>"Reviews take a day"]');
    expect(text).not.toContain('<br/>');
  });

  it('keep their outline in draw.io', () => {
    const layout = {
      positions: Object.fromEntries(flow.nodes.map((node, i) => [node.id, { x: i * 200, y: 0 }])),
      sizes: {},
    };
    const xml = toDrawio(flow, layout);
    expect(xml).toContain('ellipse;');
    expect(xml).toContain('rhombus;');
    expect(xml).toContain('shape=note;');
    expect(xml).toContain(`width="${SHAPE_SIZES.diamond.width}"`);
  });
});

describe('shapes without a name', () => {
  it('export with a blank label that Mermaid accepts, and as text in draw.io', () => {
    const graph: ArchitectureGraph = {
      schemaVersion: 1,
      title: 'Blank',
      provider: 'generic',
      nodes: [
        { id: 'a', kind: 'box', label: '' },
        { id: 't', kind: 'text', label: 'Hello' },
      ],
      edges: [],
    };
    expect(toMermaid(graph)).toContain('a[" "]');
    const xml = toDrawio(graph, { positions: {}, sizes: {} });
    expect(xml).toContain('style="');
    expect(xml).toMatch(/text;html=1/);
  });
});
