import {
  type ArchitectureGraph,
  type ArchNode,
  type DiagramLayout,
  getNodeDefinition,
  isContainerKind,
  resolveEdgeMode,
  resolveServiceName,
} from '@archdraft/core';
import { useEffect, useId, useState } from 'react';
import { KIND_ICONS } from '../icons.ts';
import { strings } from '../strings.ts';
import { type Box, absoluteBoxes, boundsOf, edgePath, truncate } from './geometry.ts';

const PADDING = 24;

type LayoutState =
  | { status: 'loading' }
  | { status: 'ready'; graph: ArchitectureGraph; layout: DiagramLayout }
  | { status: 'failed' };

/**
 * Read-only drawing of a diagram, laid out with ELK. ELK is loaded on demand
 * so that it stays out of the initial bundle. The interactive canvas (T08)
 * will replace this view and reuse its visual language.
 */
export function DiagramPreview({ graph }: { graph: ArchitectureGraph }) {
  const [state, setState] = useState<LayoutState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    import('@archdraft/layout')
      .then(({ computeLayout }) => computeLayout(graph))
      .then((layout) => {
        if (active) setState({ status: 'ready', graph, layout });
      })
      .catch((error: unknown) => {
        console.error('Could not lay out the diagram', error);
        if (active) setState({ status: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [graph]);

  if (state.status === 'failed') {
    return <p className="m-auto text-sm text-muted">{strings.canvas.layoutFailed}</p>;
  }
  if (state.status === 'loading') return null;
  return <DiagramSvg key={state.graph.title} graph={state.graph} layout={state.layout} />;
}

function DiagramSvg({ graph, layout }: { graph: ArchitectureGraph; layout: DiagramLayout }) {
  const markerId = useId();
  const boxes = absoluteBoxes(graph, layout);
  const bounds = boundsOf(boxes.values());
  if (!bounds) return null;

  const containers = graph.nodes.filter((node) => isContainerKind(node.kind));
  const components = graph.nodes.filter((node) => !isContainerKind(node.kind));
  const viewBox = [
    bounds.x - PADDING,
    bounds.y - PADDING,
    bounds.width + PADDING * 2,
    bounds.height + PADDING * 2,
  ].join(' ');

  return (
    <svg
      role="img"
      aria-label={strings.canvas.diagramLabel(graph.title)}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full animate-rise"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" style={{ fill: 'var(--edge)' }} />
        </marker>
      </defs>

      {containers.map((node) => {
        const box = boxes.get(node.id);
        return box && <ContainerShape key={node.id} node={node} box={box} />;
      })}

      {graph.edges.map((edge) => {
        const source = boxes.get(edge.source);
        const target = boxes.get(edge.target);
        if (!source || !target) return null;
        return (
          <path
            key={edge.id}
            d={edgePath(source, target)}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray={resolveEdgeMode(edge) === 'async' ? '5 5' : undefined}
            markerEnd={`url(#${markerId})`}
            style={{ stroke: 'var(--edge)' }}
          />
        );
      })}

      {components.map((node) => {
        const box = boxes.get(node.id);
        return box && <ComponentShape key={node.id} node={node} graph={graph} box={box} />;
      })}
    </svg>
  );
}

function ContainerShape({ node, box }: { node: ArchNode; box: Box }) {
  const Icon = KIND_ICONS[node.kind];
  return (
    <g transform={`translate(${box.x} ${box.y})`}>
      <rect
        width={box.width}
        height={box.height}
        rx={14}
        strokeWidth={1}
        strokeDasharray={node.kind === 'boundary' ? '6 5' : undefined}
        style={{ fill: 'var(--group-fill)', stroke: 'var(--group-line)' }}
      />
      <Icon x={14} y={14} width={14} height={14} style={{ color: 'var(--muted)' }} />
      <text x={34} y={25.5} fontSize={12} fontWeight={600} style={{ fill: 'var(--muted)' }}>
        {truncate(node.label, Math.floor((box.width - 48) / 6.5))}
      </text>
    </g>
  );
}

function ComponentShape({
  node,
  graph,
  box,
}: {
  node: ArchNode;
  graph: ArchitectureGraph;
  box: Box;
}) {
  const Icon = KIND_ICONS[node.kind];
  const { category } = getNodeDefinition(node.kind);
  const service = resolveServiceName(node, graph);
  return (
    <g transform={`translate(${box.x} ${box.y})`}>
      <title>{service === node.label ? node.label : `${node.label}: ${service}`}</title>
      <rect
        width={box.width}
        height={box.height}
        rx={12}
        strokeWidth={1}
        style={{ fill: 'var(--surface)', stroke: 'var(--line)' }}
      />
      <rect
        x={12}
        y={(box.height - 36) / 2}
        width={36}
        height={36}
        rx={10}
        style={{ fill: `var(--cat-${category}-bg)` }}
      />
      <Icon
        x={21}
        y={(box.height - 18) / 2}
        width={18}
        height={18}
        strokeWidth={1.75}
        style={{ color: `var(--cat-${category})` }}
      />
      <text
        x={58}
        y={box.height / 2 - 3}
        fontSize={13}
        fontWeight={600}
        style={{ fill: 'var(--ink)' }}
      >
        {truncate(node.label, 17)}
      </text>
      <text x={58} y={box.height / 2 + 13} fontSize={11} style={{ fill: 'var(--muted)' }}>
        {truncate(service, 21)}
      </text>
    </g>
  );
}
