import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  type CloudProvider,
  type DiagramDocument,
  type NodeCategory,
  getNodeDefinition,
  isContainerKind,
  isShapeKind,
  layoutEntry,
  resolveEdgeMode,
  resolveServiceName,
} from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';
import { type Edge, type Node, Position } from '@xyflow/react';
import { absoluteBoxes, boundsOf, nestingDepths } from './geometry.ts';

/** Seconds the diagram takes to build from its first layer to its last. */
export const BUILD_SPREAD = 0.6;

export interface ComponentNodeData extends Record<string, unknown> {
  node: ArchNode;
  category: NodeCategory;
  service: string;
  /** Set when the component runs outside the provider of the diagram. */
  providerBadge?: CloudProvider;
  sourcePosition: Position;
  targetPosition: Position;
  /** Seconds before the component appears when the diagram builds. */
  appearDelay: number;
}

export interface ContainerNodeData extends Record<string, unknown> {
  node: ArchNode;
  /** How many containers enclose this one, for its tint. */
  depth: number;
  appearDelay: number;
}

export interface ShapeNodeData extends Record<string, unknown> {
  node: ArchNode;
  sourcePosition: Position;
  targetPosition: Position;
  appearDelay: number;
}

export interface ArchitectureEdgeData extends Record<string, unknown> {
  edge: ArchEdge;
  async: boolean;
  /** Category of the component the edge starts from, for the colour of its flow particle. */
  sourceCategory: NodeCategory;
  appearDelay: number;
}

export type ComponentFlowNode = Node<ComponentNodeData, 'component'>;
export type ContainerFlowNode = Node<ContainerNodeData, 'container'>;
export type ShapeFlowNode = Node<ShapeNodeData, 'shape'>;
export type ArchitectureFlowNode = ComponentFlowNode | ContainerFlowNode | ShapeFlowNode;
export type ArchitectureFlowEdge = Edge<ArchitectureEdgeData, 'architecture'>;

export interface FlowElements {
  nodes: ArchitectureFlowNode[];
  edges: ArchitectureFlowEdge[];
}

const HANDLES: Record<LayoutDirection, { source: Position; target: Position }> = {
  LR: { source: Position.Right, target: Position.Left },
  RL: { source: Position.Left, target: Position.Right },
  TB: { source: Position.Bottom, target: Position.Top },
  BT: { source: Position.Top, target: Position.Bottom },
};

/**
 * Pure adapter from the domain document to React Flow elements.
 *
 * - Positions stay relative to the parent container, which is React Flow's
 *   convention for sub flows, and parents come before their children as
 *   React Flow requires.
 * - Nodes without a layout entry are left out, with their edges.
 * - Each element carries the delay of its entrance, so the diagram builds
 *   along its flow direction.
 * - Containers are not draggable here: dragging a large group by accident
 *   would get in the way of panning. The canvas makes the selected one
 *   draggable.
 */
export function toFlow(document: DiagramDocument, direction: LayoutDirection): FlowElements {
  const { graph, layout } = document;
  const boxes = absoluteBoxes(graph, layout);
  const bounds = boundsOf(boxes.values());
  if (!bounds) return { nodes: [], edges: [] };

  const depths = nestingDepths(graph);
  const vertical = direction === 'TB' || direction === 'BT';
  const appearDelay = (id: string): number => {
    const box = boxes.get(id);
    if (!box) return 0;
    const progress = vertical
      ? (box.y - bounds.y) / Math.max(bounds.height, 1)
      : (box.x - bounds.x) / Math.max(bounds.width, 1);
    return 0.1 + progress * BUILD_SPREAD;
  };

  const placed = graph.nodes
    .filter((node) => boxes.has(node.id))
    .sort((a, b) => (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0));

  const nodes = placed.map((node): ArchitectureFlowNode => {
    const position = layoutEntry(layout.positions, node.id) ?? { x: 0, y: 0 };
    const size = layoutEntry(layout.sizes, node.id) ?? { width: 0, height: 0 };
    const base = {
      id: node.id,
      position,
      width: size.width,
      height: size.height,
      // Given a new node object without a measured size, React Flow drops the positions of its
      // connection points and hides its edges until it measures the node again, so every edit
      // or drag step would draw them in again. The layout fixes the size, so it is known.
      measured: { width: size.width, height: size.height },
      ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
    };
    if (isContainerKind(node.kind)) {
      return {
        ...base,
        type: 'container',
        draggable: false,
        ariaLabel: `${node.label}, ${getNodeDefinition(node.kind).label}`,
        data: { node, depth: depths.get(node.id) ?? 0, appearDelay: appearDelay(node.id) * 0.5 },
      };
    }
    if (isShapeKind(node.kind)) {
      const handles = HANDLES[direction];
      return {
        ...base,
        type: 'shape',
        ariaLabel: `${node.label}, ${getNodeDefinition(node.kind).label}`,
        data: {
          node,
          sourcePosition: handles.source,
          targetPosition: handles.target,
          appearDelay: appearDelay(node.id),
        },
      };
    }
    const data = componentData(node, graph, direction, appearDelay(node.id));
    return {
      ...base,
      type: 'component',
      ariaLabel: data.service === node.label ? node.label : `${node.label}, ${data.service}`,
      data,
    };
  });

  const kinds = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const edges = graph.edges.flatMap((edge): ArchitectureFlowEdge[] => {
    const sourceKind = kinds.get(edge.source);
    if (sourceKind === undefined || !boxes.has(edge.source) || !boxes.has(edge.target)) return [];
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'architecture',
        data: {
          edge,
          async: resolveEdgeMode(edge) === 'async',
          sourceCategory: getNodeDefinition(sourceKind).category,
          appearDelay: Math.max(appearDelay(edge.source), appearDelay(edge.target)) + 0.15,
        },
      },
    ];
  });

  return { nodes, edges };
}

function componentData(
  node: ArchNode,
  graph: ArchitectureGraph,
  direction: LayoutDirection,
  appearDelay: number,
): ComponentNodeData {
  const handles = HANDLES[direction];
  return {
    node,
    category: getNodeDefinition(node.kind).category,
    service: resolveServiceName(node, graph),
    ...(node.provider !== undefined && node.provider !== graph.provider
      ? { providerBadge: node.provider }
      : {}),
    sourcePosition: handles.source,
    targetPosition: handles.target,
    appearDelay,
  };
}
