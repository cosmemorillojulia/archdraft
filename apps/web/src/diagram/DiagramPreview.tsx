import {
  type ArchEdge,
  type ArchitectureGraph,
  type ArchNode,
  type DiagramLayout,
  getNodeDefinition,
  isContainerKind,
  resolveEdgeMode,
  resolveServiceName,
} from '@archdraft/core';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { EASE_OUT, SPRING_POP } from '../motion.ts';
import { KIND_ICONS } from '../icons.ts';
import { strings } from '../strings.ts';
import {
  type Box,
  type Curve,
  absoluteBoxes,
  boundsOf,
  curveMidpoint,
  curvePath,
  curveSpan,
  edgeCurve,
  truncate,
} from './geometry.ts';

const PADDING = 24;
/** Seconds the diagram takes to build from its left edge to its right edge. */
const BUILD_SPREAD = 0.6;

type LayoutState =
  | { status: 'loading' }
  | { status: 'ready'; graph: ArchitectureGraph; layout: DiagramLayout }
  | { status: 'failed' };

/**
 * Read-only drawing of a diagram, laid out with ELK. ELK is loaded on demand
 * so that it stays out of the initial bundle. The interactive canvas (T08)
 * will replace this view and reuse its visual language and motion.
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
  return (
    <AnimatePresence mode="wait">
      {state.status === 'ready' && (
        <DiagramSvg key={state.graph.title} graph={state.graph} layout={state.layout} />
      )}
    </AnimatePresence>
  );
}

interface PlacedEdge {
  edge: ArchEdge;
  curve: Curve;
  async: boolean;
  delay: number;
  sourceCategory: string;
}

function DiagramSvg({ graph, layout }: { graph: ArchitectureGraph; layout: DiagramLayout }) {
  const markerId = useId();
  const reduceMotion = useReducedMotion() === true;
  const [focusId, setFocusId] = useState<string | null>(null);

  const scene = useMemo(() => {
    const boxes = absoluteBoxes(graph, layout);
    const bounds = boundsOf(boxes.values());
    if (!bounds) return null;
    // Nodes appear from left to right, so the diagram reads as it builds.
    const appearAt = (box: Box) =>
      0.1 + ((box.x - bounds.x) / Math.max(bounds.width, 1)) * BUILD_SPREAD;
    const edges: PlacedEdge[] = graph.edges.flatMap((edge) => {
      const source = boxes.get(edge.source);
      const target = boxes.get(edge.target);
      const sourceNode = graph.nodes.find((node) => node.id === edge.source);
      if (!source || !target || !sourceNode) return [];
      return [
        {
          edge,
          curve: edgeCurve(source, target),
          async: resolveEdgeMode(edge) === 'async',
          delay: Math.max(appearAt(source), appearAt(target)) + 0.15,
          sourceCategory: getNodeDefinition(sourceNode.kind).category,
        },
      ];
    });
    return { boxes, bounds, appearAt, edges };
  }, [graph, layout]);

  const related = useMemo(() => {
    if (focusId === null) return null;
    const nodes = new Set([focusId]);
    const edges = new Set<string>();
    for (const { id, source, target } of graph.edges) {
      if (source !== focusId && target !== focusId) continue;
      edges.add(id);
      nodes.add(source);
      nodes.add(target);
    }
    return { nodes, edges };
  }, [focusId, graph]);

  if (!scene) return null;
  const { boxes, bounds, appearAt, edges } = scene;
  const containers = graph.nodes.filter((node) => isContainerKind(node.kind));
  const components = graph.nodes.filter((node) => !isContainerKind(node.kind));
  const viewBox = [
    bounds.x - PADDING,
    bounds.y - PADDING,
    bounds.width + PADDING * 2,
    bounds.height + PADDING * 2,
  ].join(' ');

  return (
    <m.svg
      role="img"
      aria-label={strings.canvas.diagramLabel(graph.title)}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2, ease: EASE_OUT } }}
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
        <marker
          id={`${markerId}-active`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 9 5 L 0 9 z" style={{ fill: 'var(--accent)' }} />
        </marker>
      </defs>

      {containers.map((node) => {
        const box = boxes.get(node.id);
        return (
          box && <ContainerShape key={node.id} node={node} box={box} delay={appearAt(box) * 0.5} />
        );
      })}

      {edges.map((placed) => {
        const active = related?.edges.has(placed.edge.id) ?? false;
        return (
          <EdgeShape
            key={placed.edge.id}
            placed={placed}
            active={active}
            dimmed={related !== null && !active}
            markerId={active ? `${markerId}-active` : markerId}
            flowing={!reduceMotion}
          />
        );
      })}

      {components.map((node) => {
        const box = boxes.get(node.id);
        return (
          box && (
            <ComponentShape
              key={node.id}
              node={node}
              graph={graph}
              box={box}
              delay={appearAt(box)}
              focused={focusId === node.id}
              dimmed={related !== null && !related.nodes.has(node.id)}
              onFocusChange={(focused) => setFocusId(focused ? node.id : null)}
            />
          )
        );
      })}

      <AnimatePresence>
        {edges
          .filter((placed) => related?.edges.has(placed.edge.id))
          .map((placed) => (
            <EdgeLabel key={placed.edge.id} placed={placed} />
          ))}
      </AnimatePresence>
    </m.svg>
  );
}

function ContainerShape({ node, box, delay }: { node: ArchNode; box: Box; delay: number }) {
  const Icon = KIND_ICONS[node.kind];
  return (
    <g transform={`translate(${box.x} ${box.y})`}>
      <m.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay, ease: EASE_OUT }}
      >
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
      </m.g>
    </g>
  );
}

interface EdgeShapeProps {
  placed: PlacedEdge;
  active: boolean;
  dimmed: boolean;
  markerId: string;
  flowing: boolean;
}

function EdgeShape({ placed, active, dimmed, markerId, flowing }: EdgeShapeProps) {
  const { curve, async, delay, sourceCategory } = placed;
  const d = curvePath(curve);
  // Dashes and pathLength both use stroke-dasharray, so async edges fade in instead of drawing.
  const reveal = async
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 } };
  const travel = Math.min(Math.max(curveSpan(curve) / 110, 1.2), 4);

  return (
    <g className="transition-opacity duration-200" style={{ opacity: dimmed ? 0.15 : 1 }}>
      <m.path
        d={d}
        fill="none"
        strokeWidth={active ? 2 : 1.5}
        strokeDasharray={async ? '5 5' : undefined}
        markerEnd={`url(#${markerId})`}
        className="transition-[stroke,stroke-width] duration-200"
        style={{ stroke: active ? 'var(--accent)' : 'var(--edge)' }}
        {...reveal}
        transition={{ duration: 0.55, delay, ease: EASE_OUT }}
      />
      {flowing && (
        <m.circle
          r={async ? 2.25 : 2.5}
          style={{ fill: `var(--cat-${sourceCategory})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.9 }}
          transition={{ duration: 0.4, delay: delay + 0.6 }}
        >
          <animateMotion dur={`${travel}s`} repeatCount="indefinite" path={d} />
        </m.circle>
      )}
    </g>
  );
}

function EdgeLabel({ placed }: { placed: PlacedEdge }) {
  const text = placed.edge.label ?? placed.edge.protocol?.toUpperCase();
  if (text === undefined) return null;
  const { x, y } = curveMidpoint(placed.curve);
  const width = text.length * 6 + 14;
  return (
    <m.g
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      style={{ pointerEvents: 'none' }}
    >
      <rect
        x={x - width / 2}
        y={y - 10}
        width={width}
        height={20}
        rx={10}
        style={{ fill: 'var(--accent)' }}
      />
      <text
        x={x}
        y={y + 3.5}
        fontSize={10.5}
        fontWeight={600}
        textAnchor="middle"
        style={{ fill: 'var(--on-accent)' }}
      >
        {text}
      </text>
    </m.g>
  );
}

interface ComponentShapeProps {
  node: ArchNode;
  graph: ArchitectureGraph;
  box: Box;
  delay: number;
  focused: boolean;
  dimmed: boolean;
  onFocusChange: (focused: boolean) => void;
}

function ComponentShape({
  node,
  graph,
  box,
  delay,
  focused,
  dimmed,
  onFocusChange,
}: ComponentShapeProps) {
  const Icon = KIND_ICONS[node.kind];
  const { category } = getNodeDefinition(node.kind);
  const service = resolveServiceName(node, graph);
  return (
    <g
      transform={`translate(${box.x} ${box.y})`}
      onPointerEnter={() => onFocusChange(true)}
      onPointerLeave={() => onFocusChange(false)}
      className="transition-opacity duration-200"
      style={{ opacity: dimmed ? 0.3 : 1 }}
    >
      <title>{service === node.label ? node.label : `${node.label}: ${service}`}</title>
      <m.g
        initial={{ opacity: 0, scale: 0.86, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ ...SPRING_POP, delay }}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      >
        {/* Hover growth is a CSS transition so that it never inherits the entrance delay. */}
        <g
          className="transition-transform duration-200 ease-out-soft"
          style={{
            transform: focused ? 'scale(1.04)' : 'scale(1)',
            transformBox: 'fill-box',
            transformOrigin: 'center',
          }}
        >
          <rect
            width={box.width}
            height={box.height}
            rx={12}
            strokeWidth={focused ? 1.5 : 1}
            className="transition-[stroke] duration-200"
            style={{
              fill: 'var(--surface)',
              stroke: focused ? `var(--cat-${category})` : 'var(--line)',
              filter: focused ? 'drop-shadow(0 6px 16px rgb(17 24 39 / 0.16))' : undefined,
            }}
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
      </m.g>
    </g>
  );
}
