import type { ArchitectureGraph, DiagramLayout } from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { EASE_OUT } from '../motion.ts';
import { strings } from '../strings.ts';
import { ArchitectureEdge } from './ArchitectureEdge.tsx';
import { ComponentNode } from './ComponentNode.tsx';
import { ContainerNode } from './ContainerNode.tsx';
import { type ArchitectureFlowNode, toFlow } from './flow.ts';
import { type Insets, absoluteBoxes, boundsOf, initialViewport } from './geometry.ts';
import { HighlightContext, relatedTo } from './highlight.ts';
import { layoutDiagram } from './layout-client.ts';
import { ZoomControls } from './ZoomControls.tsx';

const NODE_TYPES = { component: ComponentNode, container: ContainerNode };
const EDGE_TYPES = { architecture: ArchitectureEdge };

/** Zoom range of the canvas. */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2;
/** The initial view never enlarges a diagram beyond this zoom. */
const INITIAL_MAX_ZOOM = 1.2;
/** Margin around the diagram when it is fitted, in diagram pixels. */
const FIT_MARGIN = 24;
const FIT_DURATION_MS = 450;
const INSET_SHIFT_MS = 400;

export interface DiagramCanvasProps {
  graph: ArchitectureGraph;
  direction: LayoutDirection;
  /** Space covered by the floating interface, kept clear when the diagram is fitted. */
  insets: Insets;
  /** Zoom of the first view: the diagram is not shrunk below it, the canvas pans instead. */
  readableZoom: number;
  showMiniMap: boolean;
  /** Classes that place the zoom controls clear of the floating interface. */
  controlsClassName: string;
}

type LayoutState =
  | { status: 'loading' }
  | { status: 'ready'; graph: ArchitectureGraph; layout: DiagramLayout; direction: LayoutDirection }
  | { status: 'failed' };

/**
 * The diagram canvas (React Flow, ADR 0007). It lays the diagram out in a
 * worker, builds it with an entrance animation, and pans and zooms with the
 * mouse wheel, trackpad or finger pinches, dragging, and its zoom controls.
 * Read-only until editing lands in T09.
 */
export function DiagramCanvas(props: DiagramCanvasProps) {
  const { graph, direction } = props;
  const [state, setState] = useState<LayoutState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    layoutDiagram(graph, direction)
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
    return (
      <p className="absolute inset-0 m-auto h-fit text-center text-sm text-muted">
        {strings.canvas.layoutFailed}
      </p>
    );
  }
  return (
    <AnimatePresence mode="wait">
      {state.status === 'ready' && (
        <m.div
          key={`${state.graph.title}:${state.direction}`}
          role="group"
          aria-label={strings.canvas.diagramLabel(state.graph.title)}
          className="absolute inset-0"
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2, ease: EASE_OUT } }}
        >
          <ReactFlowProvider>
            <Flow
              {...props}
              graph={state.graph}
              layout={state.layout}
              direction={state.direction}
            />
          </ReactFlowProvider>
        </m.div>
      )}
    </AnimatePresence>
  );
}

interface FlowProps extends DiagramCanvasProps {
  layout: DiagramLayout;
}

function Flow({
  graph,
  layout,
  direction,
  insets,
  readableZoom,
  showMiniMap,
  controlsClassName,
}: FlowProps) {
  const { nodes, edges } = useMemo(
    () => toFlow({ graph, layout }, direction),
    [graph, layout, direction],
  );
  const content = useMemo(() => {
    const bounds = boundsOf(absoluteBoxes(graph, layout).values());
    return bounds
      ? {
          x: bounds.x - FIT_MARGIN,
          y: bounds.y - FIT_MARGIN,
          width: bounds.width + FIT_MARGIN * 2,
          height: bounds.height + FIT_MARGIN * 2,
        }
      : null;
  }, [graph, layout]);

  const containerRef = useRef<HTMLDivElement>(null);
  const flow = useReactFlow<ArchitectureFlowNode>();
  const pointerType = useRef('mouse');
  const [focusId, setFocusId] = useState<string | null>(null);

  const markerBase = `arrow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const highlight = useMemo(
    () => ({
      focusId,
      ...relatedTo(focusId, graph.edges),
      markers: { idle: markerBase, active: `${markerBase}-active` },
    }),
    [focusId, graph.edges, markerBase],
  );

  const viewportFor = useCallback(
    (min: number) => {
      const element = containerRef.current;
      if (!content || !element) return null;
      return initialViewport(
        content,
        { width: element.clientWidth, height: element.clientHeight },
        insets,
        { min, max: INITIAL_MAX_ZOOM },
      );
    },
    [content, insets],
  );

  const onInit = useCallback(() => {
    const viewport = viewportFor(readableZoom);
    if (viewport) void flow.setViewport(viewport);
  }, [flow, readableZoom, viewportFor]);

  const fit = useCallback(() => {
    const viewport = viewportFor(MIN_ZOOM);
    if (viewport) void flow.setViewport(viewport, { duration: FIT_DURATION_MS });
  }, [flow, viewportFor]);

  // When a panel opens or closes beside the diagram, glide the view to stay centred in the free space.
  const previousLeft = useRef(insets.left);
  useEffect(() => {
    const delta = insets.left - previousLeft.current;
    previousLeft.current = insets.left;
    if (delta === 0) return;
    const viewport = flow.getViewport();
    void flow.setViewport({ ...viewport, x: viewport.x + delta / 2 }, { duration: INSET_SHIFT_MS });
  }, [flow, insets.left]);

  const isComponent = (node: ArchitectureFlowNode) => node.type === 'component';

  return (
    <HighlightContext.Provider value={highlight}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        onPointerDownCapture={(event) => {
          pointerType.current = event.pointerType;
        }}
      >
        <svg aria-hidden="true" className="absolute size-0">
          <defs>
            <ArrowMarker id={highlight.markers.idle} color="var(--edge)" />
            <ArrowMarker id={highlight.markers.active} color="var(--accent)" />
          </defs>
        </svg>
        <ReactFlow<ArchitectureFlowNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onInit={onInit}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          onNodeMouseEnter={(_event, node) => {
            if (pointerType.current !== 'touch' && isComponent(node)) setFocusId(node.id);
          }}
          onNodeMouseLeave={() => {
            if (pointerType.current !== 'touch') setFocusId(null);
          }}
          onNodeClick={(_event, node) => {
            if (pointerType.current !== 'touch' || !isComponent(node)) return;
            setFocusId((current) => (current === node.id ? null : node.id));
          }}
          onPaneClick={() => {
            if (pointerType.current === 'touch') setFocusId(null);
          }}
          className="archdraft-flow"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--dots)" />
          {showMiniMap && (
            <MiniMap<ArchitectureFlowNode>
              pannable
              zoomable
              position="bottom-right"
              ariaLabel={strings.canvas.miniMap}
              nodeColor={(node) =>
                node.type === 'component' ? `var(--cat-${node.data.category})` : 'var(--group-line)'
              }
              nodeBorderRadius={6}
              maskColor="color-mix(in srgb, var(--canvas) 72%, transparent)"
              className="floating !mb-9 overflow-hidden !rounded-panel"
              style={{ width: 176, height: 116 }}
            />
          )}
        </ReactFlow>
        <div className={`pointer-events-none absolute z-10 ${controlsClassName}`}>
          <ZoomControls onFit={fit} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} />
        </div>
      </div>
    </HighlightContext.Provider>
  );
}

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path d="M 0 1 L 9 5 L 0 9 z" style={{ fill: color }} />
    </marker>
  );
}
