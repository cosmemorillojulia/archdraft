import type { ArchitectureGraph, DiagramLayout } from '@archdraft/core';
import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { BUILD_SPREAD, toFlow } from '../src/canvas/flow.ts';

const graph: ArchitectureGraph = {
  schemaVersion: 1,
  title: 'Nested',
  provider: 'aws',
  nodes: [
    // Children listed before their parents on purpose.
    { id: 'api', kind: 'service', label: 'API', parentId: 'private' },
    { id: 'private', kind: 'subnet', label: 'Private subnet', parentId: 'vpc' },
    { id: 'vpc', kind: 'network', label: 'VPC' },
    { id: 'user', kind: 'user', label: 'User' },
    { id: 'payments', kind: 'external-system', label: 'Payments', provider: 'generic' },
    { id: 'queue', kind: 'queue', label: 'Queue' },
  ],
  edges: [
    { id: 'e1', source: 'user', target: 'api', protocol: 'https' },
    { id: 'e2', source: 'api', target: 'queue', protocol: 'amqp' },
    { id: 'e3', source: 'api', target: 'payments' },
  ],
};

const layout: DiagramLayout = {
  positions: {
    user: { x: 0, y: 100 },
    vpc: { x: 300, y: 0 },
    private: { x: 24, y: 48 },
    api: { x: 24, y: 48 },
    queue: { x: 900, y: 0 },
    payments: { x: 900, y: 200 },
  },
  sizes: {
    user: { width: 180, height: 64 },
    vpc: { width: 300, height: 260 },
    private: { width: 228, height: 160 },
    api: { width: 180, height: 64 },
    queue: { width: 180, height: 64 },
    payments: { width: 180, height: 64 },
  },
};

describe('toFlow', () => {
  it('lists every parent before its children', () => {
    const { nodes } = toFlow({ graph, layout }, 'LR');
    const order = nodes.map((node) => node.id);
    expect(order.indexOf('vpc')).toBeLessThan(order.indexOf('private'));
    expect(order.indexOf('private')).toBeLessThan(order.indexOf('api'));
  });

  it('keeps positions relative to the parent and sets sizes and parents', () => {
    const { nodes } = toFlow({ graph, layout }, 'LR');
    const api = nodes.find((node) => node.id === 'api');
    expect(api).toMatchObject({
      type: 'component',
      parentId: 'private',
      position: { x: 24, y: 48 },
      width: 180,
      height: 64,
    });
    const vpc = nodes.find((node) => node.id === 'vpc');
    expect(vpc).toMatchObject({ type: 'container', width: 300, height: 260 });
    expect(vpc).not.toHaveProperty('parentId');
  });

  it('gives nested containers their depth', () => {
    const { nodes } = toFlow({ graph, layout }, 'LR');
    const depthOf = (id: string) => nodes.find((node) => node.id === id)?.data;
    expect(depthOf('vpc')).toMatchObject({ depth: 0 });
    expect(depthOf('private')).toMatchObject({ depth: 1 });
  });

  it('resolves the product and marks components outside the provider of the diagram', () => {
    const { nodes } = toFlow({ graph, layout }, 'LR');
    expect(nodes.find((node) => node.id === 'api')?.data).toMatchObject({
      category: 'compute',
      service: 'Amazon ECS',
    });
    expect(nodes.find((node) => node.id === 'payments')?.data).toMatchObject({
      providerBadge: 'generic',
    });
    expect(nodes.find((node) => node.id === 'api')?.data).not.toHaveProperty('providerBadge');
  });

  it('places handles along the flow direction', () => {
    const lr = toFlow({ graph, layout }, 'LR').nodes.find((node) => node.id === 'user');
    const tb = toFlow({ graph, layout }, 'TB').nodes.find((node) => node.id === 'user');
    expect(lr?.data).toMatchObject({
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    expect(tb?.data).toMatchObject({
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });
  });

  it('builds along the flow: earlier layers appear first', () => {
    const { nodes, edges } = toFlow({ graph, layout }, 'LR');
    const delay = (id: string) => nodes.find((node) => node.id === id)?.data.appearDelay ?? -1;
    expect(delay('user')).toBeCloseTo(0.1);
    expect(delay('api')).toBeGreaterThan(delay('user'));
    // The left edge of the last column sits at 900 of a 1080 wide diagram.
    expect(delay('queue')).toBeCloseTo(0.1 + (900 / 1080) * BUILD_SPREAD);
    const e1 = edges.find((edge) => edge.id === 'e1');
    expect(e1?.data?.appearDelay).toBeCloseTo(delay('api') + 0.15);
  });

  it('marks async edges and keeps the category of the source', () => {
    const { edges } = toFlow({ graph, layout }, 'LR');
    expect(edges.find((edge) => edge.id === 'e2')?.data).toMatchObject({
      async: true,
      sourceCategory: 'compute',
    });
    expect(edges.find((edge) => edge.id === 'e1')?.data).toMatchObject({
      async: false,
      sourceCategory: 'actor',
    });
  });

  it('leaves out nodes without layout, their descendants and their edges', () => {
    const { private: _private, ...positions } = layout.positions;
    const { nodes, edges } = toFlow({ graph, layout: { ...layout, positions } }, 'LR');
    expect(nodes.map((node) => node.id)).not.toContain('private');
    expect(nodes.map((node) => node.id)).not.toContain('api');
    expect(edges).toEqual([]);
  });

  it('names nodes for assistive technology and leaves groups in place until selected', () => {
    const { nodes } = toFlow({ graph, layout }, 'LR');
    const byId = (id: string) => nodes.find((node) => node.id === id);
    expect(byId('api')).toMatchObject({ ariaLabel: 'API, Amazon ECS' });
    expect(byId('api')).not.toHaveProperty('draggable');
    expect(byId('vpc')).toMatchObject({ ariaLabel: 'VPC, Virtual network', draggable: false });
  });

  it('returns nothing for an empty diagram', () => {
    expect(
      toFlow(
        { graph: { ...graph, nodes: [], edges: [] }, layout: { positions: {}, sizes: {} } },
        'LR',
      ),
    ).toEqual({ nodes: [], edges: [] });
  });
});
