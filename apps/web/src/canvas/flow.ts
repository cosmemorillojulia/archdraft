import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  type CloudProvider,
  type DiagramDocument,
  type EdgeRoute,
  type EdgeStyle,
  type NodeCategory,
  getNodeDefinition,
  type NodeKind,
  isContainerKind,
  isShapeKind,
  layoutEntry,
  ownEdgeRoute,
  resolveEdgeMode,
  resolveEdgeStyle,
} from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';
import type { Edge, Node } from '@xyflow/react';
import { en, type KindText } from '../i18n/en.ts';
import { productName } from '../i18n/labels.ts';
import {
  absoluteBoxes,
  type Box,
  boundsOf,
  edgeSides,
  nestingDepths,
  stackingOrder,
} from './geometry.ts';

/** What a screen reader says for a node: name and kind, or only the kind if it has no name. */
const spoken = (label: string, kind: string): string => (label === '' ? kind : `${label}, ${kind}`);

/** Seconds the diagram takes to build from its first layer to its last. */
export const BUILD_SPREAD = 0.6;

export interface ComponentNodeData extends Record<string, unknown> {
  node: ArchNode;
  category: NodeCategory;
  service: string;
  /** Set when the component runs outside the provider of the diagram. */
  providerBadge?: CloudProvider;
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
  appearDelay: number;
}

export interface ArchitectureEdgeData extends Record<string, unknown> {
  edge: ArchEdge;
  async: boolean;
  /** Curved or right-angled: the style of the edge, or else the one of the diagram. */
  style: EdgeStyle;
  /** What was decided by hand about how the edge runs: its sides and the bend of its middle. */
  route: EdgeRoute | undefined;
  /** The boxes of its two nodes, for choosing another side to attach to, and the flow direction. */
  sourceBox: Box;
  targetBox: Box;
  direction: LayoutDirection;
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

/**
 * Pure adapter from the domain document to React Flow elements.
 *
 * - Positions stay relative to the parent container, which is React Flow's
 *   convention for sub flows, and parents come before their children as
 *   React Flow requires.
 * - Nodes without a layout entry are left out, with their edges.
 * - Kind names, in accessible names and as the product of components that
 *   name none, come from `kinds`, in the language of the interface.
 * - Each edge leaves by the right or bottom of its source and arrives at the left or
 *   top of its target, whichever pair makes the shortest line (`edgeSides`), unless its
 *   route fixes a side.
 * - Each element carries the delay of its entrance, so the diagram builds
 *   along its flow direction.
 * - Containers are not draggable here: dragging a large group by accident
 *   would get in the way of panning. The canvas makes the selected one
 *   draggable.
 */
export function toFlow(
  document: DiagramDocument,
  direction: LayoutDirection,
  kinds: Readonly<Record<NodeKind, KindText>> = en.kinds,
): FlowElements {
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

  const placed = stackingOrder(graph).filter((node) => boxes.has(node.id));

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
        ariaLabel: spoken(node.label, kinds[node.kind].label),
        data: { node, depth: depths.get(node.id) ?? 0, appearDelay: appearDelay(node.id) * 0.5 },
      };
    }
    if (isShapeKind(node.kind)) {
      return {
        ...base,
        type: 'shape',
        // Text fixed to a box moves with it, not by itself.
        ...(node.attachedTo === undefined ? {} : { draggable: false }),
        ariaLabel: spoken(node.label, kinds[node.kind].label),
        data: { node, appearDelay: appearDelay(node.id) },
      };
    }
    const data = componentData(node, graph, appearDelay(node.id), kinds);
    return {
      ...base,
      type: 'component',
      ariaLabel: data.service === node.label ? node.label : `${node.label}, ${data.service}`,
      data,
    };
  });

  const kindOf = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const edges = graph.edges.flatMap((edge): ArchitectureFlowEdge[] => {
    const sourceKind = kindOf.get(edge.source);
    const from = boxes.get(edge.source);
    const to = boxes.get(edge.target);
    if (sourceKind === undefined || !from || !to) return [];
    const route = ownEdgeRoute(layout, edge.id);
    const sides = edgeSides(from, to, direction, route);
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: sides.source,
        targetHandle: sides.target,
        type: 'architecture',
        data: {
          edge,
          async: resolveEdgeMode(edge) === 'async',
          style: resolveEdgeStyle(layout, edge.id),
          route,
          sourceBox: from,
          targetBox: to,
          direction,
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
  appearDelay: number,
  kinds: Readonly<Record<NodeKind, KindText>>,
): ComponentNodeData {
  return {
    node,
    category: getNodeDefinition(node.kind).category,
    service: productName(node, graph, kinds),
    ...(node.provider !== undefined && node.provider !== graph.provider
      ? { providerBadge: node.provider }
      : {}),
    appearDelay,
  };
}
