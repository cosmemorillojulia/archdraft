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
import type { LayoutDirection } from '@archdraft/layout';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import {
  type PointerEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  drawingScale,
  edgeCurve,
  nestingDepths,
  truncate,
} from './geometry.ts';

const PADDING = 24;
/** Seconds the diagram takes to build from its first layer to its last. */
const BUILD_SPREAD = 0.6;
/** Small diagrams grow to fill the canvas, but not beyond this scale. */
const MAX_SCALE = 1.4;
/** Percentage of accent mixed into a group's fill, and how much more each nesting level adds. */
const GROUP_TINT_BASE = 3;
const GROUP_TINT_STEP = 2.5;

type LayoutState =
  | { status: 'loading' }
  | {
      status: 'ready';
      graph: ArchitectureGraph;
      layout: DiagramLayout;
      direction: LayoutDirection;
    }
  | { status: 'failed' };

interface DiagramPreviewProps {
  graph: ArchitectureGraph;
  /** Flow direction of the layout: left to right on wide screens, top to bottom on narrow ones. */
  direction: LayoutDirection;
  /** Below this scale the diagram stops shrinking and the canvas scrolls instead. */
  minScale: number;
}

/**
 * Read-only drawing of a diagram, laid out with ELK. ELK is loaded on demand
 * so that it stays out of the initial bundle. The interactive canvas (T08)
 * will replace this view and reuse its visual language and motion.
 */
export function DiagramPreview({ graph, direction, minScale }: DiagramPreviewProps) {
  const [state, setState] = useState<LayoutState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    import('@archdraft/layout')
      .then(({ computeLayout }) => computeLayout(graph, { direction }))
      .then((layout) => {
        if (active) setState({ status: 'ready', graph, layout, direction });
      })
      .catch((error: unknown) => {
        console.error('Could not lay out the diagram', error);
        if (active) setState({ status: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [graph, direction]);

  if (state.status === 'failed') {
    return <p className="m-auto text-sm text-muted">{strings.canvas.layoutFailed}</p>;
  }
  return (
    <AnimatePresence mode="wait">
      {state.status === 'ready' && (
        <DiagramSvg
          key={`${state.graph.title}:${state.direction}`}
          graph={state.graph}
          layout={state.layout}
          direction={state.direction}
          minScale={minScale}
        />
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

/** Size of an element, measured before paint and kept up to date when it resizes. */
function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

interface DiagramSvgProps {
  graph: ArchitectureGraph;
  layout: DiagramLayout;
  direction: LayoutDirection;
  minScale: number;
}

function DiagramSvg({ graph, layout, direction, minScale }: DiagramSvgProps) {
  const markerId = useId();
  const reduceMotion = useReducedMotion() === true;
  const [focusId, setFocusId] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(viewportRef);

  const scene = useMemo(() => {
    const boxes = absoluteBoxes(graph, layout);
    const bounds = boundsOf(boxes.values());
    if (!bounds) return null;
    // Nodes appear along the flow direction, so the diagram reads as it builds.
    const vertical = direction === 'TB' || direction === 'BT';
    const appearAt = (box: Box) => {
      const progress = vertical
        ? (box.y - bounds.y) / Math.max(bounds.height, 1)
        : (box.x - bounds.x) / Math.max(bounds.width, 1);
      return 0.1 + progress * BUILD_SPREAD;
    };
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
    return { boxes, bounds, appearAt, edges, depths: nestingDepths(graph) };
  }, [graph, layout, direction]);

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

  const content = scene && {
    width: scene.bounds.width + PADDING * 2,
    height: scene.bounds.height + PADDING * 2,
  };
  const scale = content ? drawingScale(content, viewport, { min: minScale, max: MAX_SCALE }) : 1;
  const overflows =
    content !== null &&
    (content.width * scale > viewport.width || content.height * scale > viewport.height);

  // When the diagram is larger than the canvas, start from the top, centred horizontally.
  const scrolled = useRef(false);
  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element || !overflows || scrolled.current) return;
    element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
    element.scrollTop = 0;
    scrolled.current = true;
  }, [overflows]);

  if (!scene || !content) return null;
  const { boxes, bounds, appearAt, edges, depths } = scene;
  const containers = graph.nodes.filter((node) => isContainerKind(node.kind));
  const components = graph.nodes.filter((node) => !isContainerKind(node.kind));
  const viewBox = [bounds.x - PADDING, bounds.y - PADDING, content.width, content.height].join(' ');

  // A tap outside any component clears the highlight on touch screens.
  const clearOnTap = (event: PointerEvent) => {
    if (event.pointerType === 'touch') setFocusId(null);
  };

  return (
    <m.div
      ref={viewportRef}
      onPointerUp={clearOnTap}
      className="h-full w-full overflow-auto overscroll-contain [scrollbar-width:none]"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2, ease: EASE_OUT } }}
    >
      <div className="flex min-h-full w-max min-w-full items-center justify-center">
        <svg
          role="img"
          aria-label={strings.canvas.diagramLabel(graph.title)}
          viewBox={viewBox}
          width={content.width * scale}
          height={content.height * scale}
          className="shrink-0"
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
              box && (
                <ContainerShape
                  key={node.id}
                  node={node}
                  box={box}
                  depth={depths.get(node.id) ?? 0}
                  delay={appearAt(box) * 0.5}
                />
              )
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
                  onHoverChange={(hovered) => setFocusId(hovered ? node.id : null)}
                  onTap={() => setFocusId((current) => (current === node.id ? null : node.id))}
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
        </svg>
      </div>
    </m.div>
  );
}

interface ContainerShapeProps {
  node: ArchNode;
  box: Box;
  depth: number;
  delay: number;
}

function ContainerShape({ node, box, depth, delay }: ContainerShapeProps) {
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
          style={{
            // Opaque, so the canvas dots stay outside the groups; deeper groups get a stronger tint.
            fill: `color-mix(in srgb, var(--accent) ${GROUP_TINT_BASE + depth * GROUP_TINT_STEP}%, var(--canvas))`,
            stroke: 'var(--group-line)',
          }}
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
  /** Mouse and pen: highlight while the pointer is over the component. */
  onHoverChange: (hovered: boolean) => void;
  /** Touch: a tap toggles the highlight. */
  onTap: () => void;
}

function ComponentShape({
  node,
  graph,
  box,
  delay,
  focused,
  dimmed,
  onHoverChange,
  onTap,
}: ComponentShapeProps) {
  const Icon = KIND_ICONS[node.kind];
  const { category } = getNodeDefinition(node.kind);
  const service = resolveServiceName(node, graph);
  return (
    <g
      transform={`translate(${box.x} ${box.y})`}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') onHoverChange(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') onHoverChange(false);
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== 'touch') return;
        event.stopPropagation();
        onTap();
      }}
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
