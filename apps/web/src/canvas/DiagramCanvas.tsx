import type { LintSeverity } from '@archdraft/core';
import {
  Background,
  BackgroundVariant,
  type Connection,
  type FinalConnectionState,
  MiniMap,
  type NodeChange,
  ReactFlow,
  useReactFlow,
  type XYPosition,
} from '@xyflow/react';
import { AnimatePresence, m } from 'motion/react';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { containerAt, fitResize, subtreeOf } from '../editor/operations.ts';
import { editorStore, isInspectorExpanded, type Snapshot, useEditor } from '../editor/store.ts';
import { findingKey, severityByNode, useFindings } from '../review/findings.ts';
import { reviewStore, useReview } from '../review/review-store.ts';
import { EASE_OUT } from '../motion.ts';
import { usePaletteDrag } from '../palette/palette-drag.ts';
import { usePreferences } from '../preferences.ts';
import { useStrings } from '../i18n/locale.ts';
import { ArchitectureEdge } from './ArchitectureEdge.tsx';
import { CanvasContext, type NodeBox, relatedTo } from './canvas-context.ts';
import { ComponentNode } from './ComponentNode.tsx';
import { ContainerNode } from './ContainerNode.tsx';
import { ShapeNode } from './ShapeNode.tsx';
import { type ArchitectureFlowEdge, type ArchitectureFlowNode, toFlow } from './flow.ts';
import { useStableHandler } from './use-stable-handler.ts';
import { type Insets, absoluteBoxes, boundsOf, initialViewport } from './geometry.ts';
import { ZoomControls } from './ZoomControls.tsx';

const NODE_TYPES = { component: ComponentNode, container: ContainerNode, shape: ShapeNode };
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
/** How long the entrance of a freshly opened diagram lasts. Later additions appear at once. */
const BUILD_MS = 1200;
/** Pixels a pointer moves before a press on a node becomes a drag, so taps stay taps. */
const DRAG_THRESHOLD = 4;
/**
 * Room the inspector can take (Inspector.tsx): a 320 px column on the right
 * with its margins, or, expanded, at most 52 % of the screen height and
 * 480 px at the bottom, 12 px above the edge. Collapsed, the strip at the
 * bottom is lower than the room the insets already keep for the prompt.
 */
const SIDE_INSPECTOR_COVER = 356;
const bottomInspectorCover = () => Math.min(window.innerHeight * 0.52, 480) + 12;
const REVEAL_MARGIN = 16;
const REVEAL_MS = 300;
/** Length of the glide to a finding chosen in the design review. */
const FOCUS_MS = 450;
/** Stacking order of the node being dragged: above every group, below the edge labels. */
const DRAGGED_Z = 1000;

const CONNECTION_LINE_STYLE = { stroke: 'var(--accent)', strokeWidth: 1.5 };
const PRO_OPTIONS = { hideAttribution: true };
const NO_ISSUES: ReadonlyMap<string, LintSeverity> = new Map();

export interface DiagramCanvasProps {
  /** Space covered by the floating interface, kept clear when the diagram is fitted. */
  insets: Insets;
  showMiniMap: boolean;
  /** Classes that place the zoom controls clear of the floating interface. */
  controlsClassName: string;
  /** Where the inspector opens, so that the view keeps a selected node clear of it. */
  inspectorPlacement: 'side' | 'bottom';
}

/**
 * The diagram canvas (React Flow, ADR 0007), a view of the editor store
 * (ADR 0017). It builds a newly opened diagram with an entrance animation,
 * pans and zooms with the mouse wheel, trackpad or finger pinches, dragging
 * and its zoom controls, and turns clicks, drags and drops into edits.
 */
export function DiagramCanvas(props: DiagramCanvasProps) {
  const strings = useStrings();
  const current = useEditor((state) => state.current);
  return (
    <AnimatePresence mode="wait">
      {current && (
        <m.div
          key={current.key}
          role="group"
          aria-label={strings.canvas.diagramLabel(current.document.graph.title)}
          className="absolute inset-0"
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2, ease: EASE_OUT } }}
        >
          <Flow {...props} snapshot={current} />
        </m.div>
      )}
    </AnimatePresence>
  );
}

interface FlowProps extends DiagramCanvasProps {
  snapshot: Snapshot;
}

function Flow({ snapshot, insets, showMiniMap, controlsClassName, inspectorPlacement }: FlowProps) {
  const strings = useStrings();
  const { document: diagram, direction } = snapshot;
  const selection = useEditor((state) => state.selection);
  const renamingId = useEditor((state) => state.renaming);
  const inspectorExpanded = useEditor(isInspectorExpanded);
  const particles = usePreferences((state) => state.flowAnimation);
  const findings = useFindings();
  const reviewOpen = useReview((state) => state.open);
  const activeKey = useReview((state) => state.activeKey);
  const focusCount = useReview((state) => state.focusCount);
  const flow = useReactFlow<ArchitectureFlowNode, ArchitectureFlowEdge>();
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerType = useRef('mouse');

  const elements = useMemo(
    () => toFlow(diagram, direction, strings.kinds),
    [diagram, direction, strings],
  );
  const boxes = useMemo(() => absoluteBoxes(diagram.graph, diagram.layout), [diagram]);
  const content = useMemo(() => {
    const bounds = boundsOf(boxes.values());
    return bounds
      ? {
          x: bounds.x - FIT_MARGIN,
          y: bounds.y - FIT_MARGIN,
          width: bounds.width + FIT_MARGIN * 2,
          height: bounds.height + FIT_MARGIN * 2,
        }
      : null;
  }, [boxes]);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; position: XYPosition } | null>(null);
  const [nodeDropTargetId, setDropTargetId] = useState<string | null>(null);
  // A tile dragged from the palette lights up the group it would be added to, like a dragged node.
  const paletteDropTargetId = usePaletteDrag(({ drag }) =>
    drag?.overCanvas === true
      ? (containerAt(diagram, flow.screenToFlowPosition(drag.point), drag.kind) ?? null)
      : null,
  );
  const dropTargetId = nodeDropTargetId ?? paletteDropTargetId;
  // Like a drag, a resize in progress lives here and reaches the store when it ends.
  const [resizing, setResizing] = useState<{ id: string; box: NodeBox } | null>(null);
  const resize = useCallback((id: string, box: NodeBox, done: boolean) => {
    if (done) {
      editorStore.getState().resizeNode(id, box);
      setResizing(null);
    } else {
      setResizing({ id, box });
    }
  }, []);
  const [building, setBuilding] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setBuilding(false), BUILD_MS);
    return () => clearTimeout(timer);
  }, []);

  // The store holds where nodes rest; while one is dragged, its position lives here.
  const selectedNodeId = selection?.type === 'node' ? selection.id : null;
  // A resize in progress shows the box the editor will accept, with the contents of a group in place.
  const fitted = useMemo(
    () => (resizing ? fitResize(diagram, resizing.id, resizing.box) : null),
    [diagram, resizing],
  );
  const nodes = useMemo(() => {
    if (!dragging && !resizing && selectedNodeId === null) return elements.nodes;
    return elements.nodes.map((node) => {
      if (resizing && fitted && node.id === resizing.id) {
        const { x, y, width, height } = fitted.box;
        return { ...node, position: { x, y }, width, height, measured: { width, height } };
      }
      if (resizing && fitted && node.parentId === resizing.id) {
        const { shift } = fitted;
        if (shift.x !== 0 || shift.y !== 0) {
          return {
            ...node,
            position: { x: node.position.x - shift.x, y: node.position.y - shift.y },
          };
        }
      }
      // Lifted above everything while dragged, so opaque groups do not hide it.
      if (node.id === dragging?.id) {
        return { ...node, position: dragging.position, draggable: true, zIndex: DRAGGED_Z };
      }
      if (node.id === selectedNodeId) return { ...node, draggable: true };
      return node;
    });
  }, [elements.nodes, dragging, fitted, resizing, selectedNodeId]);

  // While the review is open, components show their most severe finding, and the chosen
  // finding stands out with everything else faded.
  const issues = useMemo(
    () => (reviewOpen ? severityByNode(findings) : NO_ISSUES),
    [findings, reviewOpen],
  );
  const activeFinding = useMemo(
    () =>
      reviewOpen && activeKey !== null
        ? findings.find((finding) => findingKey(finding) === activeKey)
        : undefined,
    [activeKey, findings, reviewOpen],
  );

  // While a node is dragged or resized, nothing else highlights. The canvas context changes
  // when that starts and ends, not at every step: each change re-renders every node and edge.
  const draggingId = dragging?.id ?? null;
  const busyId = draggingId ?? resizing?.id ?? null;
  const canvas = useMemo(() => {
    const hovered = busyId === null ? hoverId : null;
    const shared = { selection, renamingId, dropTargetId, building, particles, issues, resize };
    if (hovered === null && activeFinding) {
      const nodes = new Set(activeFinding.nodeIds);
      return {
        ...shared,
        focusId: null,
        nodes,
        edges: new Set(activeFinding.edgeIds),
        dimOthers: true,
        finding: { nodes, severity: activeFinding.severity },
      };
    }
    const focusId = draggingId === null ? (hovered ?? selectedNodeId) : null;
    return {
      ...shared,
      focusId,
      ...relatedTo(focusId, diagram.graph.edges),
      dimOthers: hovered !== null,
      finding: null,
    };
  }, [
    activeFinding,
    building,
    busyId,
    diagram.graph.edges,
    draggingId,
    dropTargetId,
    hoverId,
    issues,
    particles,
    renamingId,
    resize,
    selectedNodeId,
    selection,
  ]);

  /** The whole diagram, centred in the part of the canvas the floating interface leaves free. */
  const fittedViewport = useCallback(() => {
    const element = containerRef.current;
    if (!content || !element) return null;
    return initialViewport(
      content,
      { width: element.clientWidth, height: element.clientHeight },
      insets,
      { min: MIN_ZOOM, max: INITIAL_MAX_ZOOM },
    );
  }, [content, insets]);

  // React Flow calls this once per mount, that is, every time a diagram opens: it opens whole.
  // Later edits never move the view.
  const onInit = useCallback(() => {
    const viewport = fittedViewport();
    if (viewport) void flow.setViewport(viewport);
  }, [flow, fittedViewport]);

  const fit = useCallback(() => {
    const viewport = fittedViewport();
    if (viewport) void flow.setViewport(viewport, { duration: FIT_DURATION_MS });
  }, [flow, fittedViewport]);

  // When a panel opens or closes beside the diagram, glide the view to stay centred in the free space.
  const previousLeft = useRef(insets.left);
  useEffect(() => {
    const delta = insets.left - previousLeft.current;
    previousLeft.current = insets.left;
    if (delta === 0) return;
    const viewport = flow.getViewport();
    void flow.setViewport({ ...viewport, x: viewport.x + delta / 2 }, { duration: INSET_SHIFT_MS });
  }, [flow, insets.left]);

  /** Part of the canvas left free by the floating interface, with a panel open. */
  const freeArea = useCallback(() => {
    const element = containerRef.current;
    if (!element) return null;
    const width = element.clientWidth;
    const height = element.clientHeight;
    const cover =
      inspectorPlacement === 'side'
        ? { ...insets, right: Math.max(insets.right, SIDE_INSPECTOR_COVER) }
        : inspectorExpanded
          ? { ...insets, bottom: Math.max(insets.bottom, bottomInspectorCover()) }
          : insets;
    return {
      left: cover.left + REVEAL_MARGIN,
      top: cover.top + REVEAL_MARGIN,
      right: width - cover.right - REVEAL_MARGIN,
      bottom: height - cover.bottom - REVEAL_MARGIN,
    };
  }, [insets, inspectorExpanded, inspectorPlacement]);

  /** What the view was last moved to show: a node, under the inspector expanded or not. */
  const revealed = useRef<{ id: string | null; expanded: boolean }>({ id: null, expanded: false });

  // A finding chosen in the review glides to the middle of the free area, zooming out if it does not fit.
  const focusedCount = useRef(focusCount);
  useEffect(() => {
    if (focusCount === focusedCount.current) return;
    focusedCount.current = focusCount;
    const area = freeArea();
    const bounds = boundsOf(
      (activeFinding?.nodeIds ?? []).flatMap((id) => {
        const box = boxes.get(id);
        return box ? [box] : [];
      }),
    );
    if (!area || !bounds) return;
    // The finding selects its first component, which this glide already brings into view.
    revealed.current = { id: activeFinding?.nodeIds[0] ?? null, expanded: inspectorExpanded };
    const current = flow.getViewport();
    const width = area.right - area.left;
    const height = area.bottom - area.top;
    const zoom = Math.max(
      Math.min(current.zoom, width / bounds.width, height / bounds.height),
      MIN_ZOOM,
    );
    void flow.setViewport(
      {
        x: area.left + width / 2 - (bounds.x + bounds.width / 2) * zoom,
        y: area.top + height / 2 - (bounds.y + bounds.height / 2) * zoom,
        zoom,
      },
      { duration: FOCUS_MS },
    );
  }, [activeFinding, boxes, flow, focusCount, freeArea, inspectorExpanded]);

  // A newly selected node hidden behind the inspector or another panel glides into view,
  // and again when the inspector expands over it.
  useEffect(() => {
    const last = revealed.current;
    if (selectedNodeId === last.id && inspectorExpanded === last.expanded) return;
    revealed.current = { id: selectedNodeId, expanded: inspectorExpanded };
    const box = selectedNodeId === null ? undefined : boxes.get(selectedNodeId);
    const area = freeArea();
    if (!box || !area) return;
    const { x, y, zoom } = flow.getViewport();
    const left = box.x * zoom + x;
    const top = box.y * zoom + y;
    const shift = (start: number, end: number, min: number, max: number) =>
      start < min ? min - start : end > max ? Math.max(max - end, min - start) : 0;
    const dx = shift(left, left + box.width * zoom, area.left, area.right);
    const dy = shift(top, top + box.height * zoom, area.top, area.bottom);
    if (dx !== 0 || dy !== 0) {
      void flow.setViewport({ x: x + dx, y: y + dy, zoom }, { duration: REVEAL_MS });
    }
  }, [boxes, flow, freeArea, inspectorExpanded, selectedNodeId]);

  /** Container the node would move into if dropped now, if it is not its current one. */
  const dropTargetFor = (node: ArchitectureFlowNode): string | null => {
    const origin = (node.parentId === undefined ? undefined : boxes.get(node.parentId)) ?? {
      x: 0,
      y: 0,
    };
    const box = boxes.get(node.id);
    if (!box) return null;
    const centre = {
      x: origin.x + node.position.x + box.width / 2,
      y: origin.y + node.position.y + box.height / 2,
    };
    const target = containerAt(
      diagram,
      centre,
      node.data.node.kind,
      subtreeOf(diagram.graph, node.id),
    );
    return target === node.parentId ? null : (target ?? null);
  };

  const onNodesChange = useCallback((changes: NodeChange<ArchitectureFlowNode>[]) => {
    for (const change of changes) {
      if (change.type === 'position' && change.dragging && change.position) {
        setDragging({ id: change.id, position: change.position });
      }
    }
  }, []);

  const connectTo = (source: string, target: string) => {
    if (source !== target) editorStore.getState().connect(source, target);
  };

  // Handlers given to React Flow keep their identity (see useStableHandler).
  // Moving a node is not editing it: the selection, and so the inspector, stay as they were.
  const onNodeDragStart = useStableHandler(() => setHoverId(null));
  const onNodeDrag = useStableHandler((_event: unknown, node: ArchitectureFlowNode) =>
    setDropTargetId(dropTargetFor(node)),
  );
  const onNodeDragStop = useStableHandler((_event: unknown, node: ArchitectureFlowNode) => {
    editorStore.getState().moveNode(node.id, node.position);
    setDragging(null);
    setDropTargetId(null);
  });
  const onConnect = useStableHandler(({ source, target }: Connection) => connectTo(source, target));
  const onNodeMouseEnter = useStableHandler((_event: unknown, node: ArchitectureFlowNode) => {
    if (pointerType.current !== 'touch' && node.type !== 'container') setHoverId(node.id);
  });
  const onNodeMouseLeave = useStableHandler(() => setHoverId(null));
  const onNodeClick = useStableHandler((_event: unknown, node: ArchitectureFlowNode) => {
    const editor = editorStore.getState();
    // Choosing a component on the canvas means editing it: the inspector takes over.
    reviewStore.getState().setOpen(false);
    if (editor.connectingFrom === null) editor.select({ type: 'node', id: node.id });
    else if (editor.connectingFrom === node.id) editor.cancelConnection();
    else editor.connect(editor.connectingFrom, node.id);
  });
  const onNodeDoubleClick = useStableHandler((_event: unknown, node: ArchitectureFlowNode) =>
    editorStore.getState().startRename(node.id),
  );
  const onEdgeClick = useStableHandler((_event: unknown, edge: ArchitectureFlowEdge) => {
    reviewStore.getState().setOpen(false);
    editorStore.getState().select({ type: 'edge', id: edge.id });
  });
  const onPaneClick = useStableHandler(() => {
    editorStore.getState().select(null);
    reviewStore.getState().clearFocus();
  });

  // Dropping a connection anywhere on a component connects to it, not only on its connection point.
  const onConnectEnd = useStableHandler(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode) return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      if (!point) return;
      const element = globalThis.document
        .elementFromPoint(point.clientX, point.clientY)
        ?.closest('.react-flow__node');
      const target = element?.getAttribute('data-id');
      if (target) connectTo(state.fromNode.id, target);
    },
  );

  // Enter or Space on a focused node or edge selects it, which opens the inspector.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as Element;
    const id = target.getAttribute('data-id');
    if (id === null) return;
    if (target.classList.contains('react-flow__node')) {
      event.preventDefault();
      editorStore.getState().select({ type: 'node', id });
    } else if (target.classList.contains('react-flow__edge')) {
      event.preventDefault();
      editorStore.getState().select({ type: 'edge', id });
    }
  };

  return (
    <CanvasContext.Provider value={canvas}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        onPointerDownCapture={(event) => {
          pointerType.current = event.pointerType;
        }}
        onKeyDown={onKeyDown}
      >
        <ReactFlow<ArchitectureFlowNode, ArchitectureFlowEdge>
          nodes={nodes}
          edges={elements.edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          // React Flow is credited in the README; its MIT licence allows hiding the corner link.
          proOptions={PRO_OPTIONS}
          onInit={onInit}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          // Selection, deletion and shortcuts belong to the editor store, not to React Flow.
          elementsSelectable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          connectOnClick={false}
          nodeDragThreshold={DRAG_THRESHOLD}
          connectionLineStyle={CONNECTION_LINE_STYLE}
          onNodesChange={onNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          zoomOnDoubleClick={false}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
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
                node.type === 'component'
                  ? `var(--cat-${node.data.category})`
                  : node.type === 'shape'
                    ? 'var(--cat-shape)'
                    : 'var(--group-line)'
              }
              nodeBorderRadius={6}
              maskColor="color-mix(in srgb, var(--canvas) 72%, transparent)"
              className="floating !m-3 !mr-15 overflow-hidden !rounded-panel"
              style={{ width: 176, height: 157 }}
            />
          )}
        </ReactFlow>
        <div className={`pointer-events-none absolute z-10 ${controlsClassName}`}>
          <ZoomControls onFit={fit} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} />
        </div>
      </div>
    </CanvasContext.Provider>
  );
}
