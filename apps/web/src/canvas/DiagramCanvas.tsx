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
import {
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { containerAt, subtreeOf } from '../editor/operations.ts';
import { editorStore, type Snapshot, useEditor } from '../editor/store.ts';
import { EASE_OUT } from '../motion.ts';
import { strings } from '../strings.ts';
import { ArchitectureEdge } from './ArchitectureEdge.tsx';
import { CanvasContext, relatedTo } from './canvas-context.ts';
import { ComponentNode } from './ComponentNode.tsx';
import { ContainerNode } from './ContainerNode.tsx';
import { type ArchitectureFlowEdge, type ArchitectureFlowNode, toFlow } from './flow.ts';
import { type Insets, absoluteBoxes, boundsOf, initialViewport } from './geometry.ts';
import { isNodeKind, KIND_MIME } from './palette-drop.ts';
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
/** How long the entrance of a freshly opened diagram lasts. Later additions appear at once. */
const BUILD_MS = 1200;
/** Pixels a pointer moves before a press on a node becomes a drag, so taps stay taps. */
const DRAG_THRESHOLD = 4;
/**
 * Room the inspector can take (Inspector.tsx): a 320 px column on the right
 * with its margins, or at most 52 % of the screen height and 480 px at the
 * bottom, 12 px above the edge.
 */
const SIDE_INSPECTOR_COVER = 356;
const bottomInspectorCover = () => Math.min(window.innerHeight * 0.52, 480) + 12;
const REVEAL_MARGIN = 16;
const REVEAL_MS = 300;
/** Stacking order of the node being dragged: above every group, below the edge labels. */
const DRAGGED_Z = 1000;

const CONNECTION_LINE_STYLE = { stroke: 'var(--accent)', strokeWidth: 1.5 };

export interface DiagramCanvasProps {
  /** Space covered by the floating interface, kept clear when the diagram is fitted. */
  insets: Insets;
  /** Zoom of the first view: the diagram is not shrunk below it, the canvas pans instead. */
  readableZoom: number;
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

function Flow({
  snapshot,
  insets,
  readableZoom,
  showMiniMap,
  controlsClassName,
  inspectorPlacement,
}: FlowProps) {
  const { document: diagram, direction } = snapshot;
  const selection = useEditor((state) => state.selection);
  const flow = useReactFlow<ArchitectureFlowNode, ArchitectureFlowEdge>();
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerType = useRef('mouse');

  const elements = useMemo(() => toFlow(diagram, direction), [diagram, direction]);
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
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [building, setBuilding] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setBuilding(false), BUILD_MS);
    return () => clearTimeout(timer);
  }, []);

  // The store holds where nodes rest; while one is dragged, its position lives here.
  const selectedNodeId = selection?.type === 'node' ? selection.id : null;
  const nodes = useMemo(() => {
    if (!dragging && selectedNodeId === null) return elements.nodes;
    return elements.nodes.map((node) => {
      // Lifted above everything while dragged, so opaque groups do not hide it.
      if (node.id === dragging?.id) {
        return { ...node, position: dragging.position, draggable: true, zIndex: DRAGGED_Z };
      }
      if (node.id === selectedNodeId) return { ...node, draggable: true };
      return node;
    });
  }, [elements.nodes, dragging, selectedNodeId]);

  const markerBase = `arrow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const canvas = useMemo(() => {
    const focusId = dragging ? null : (hoverId ?? selectedNodeId);
    return {
      focusId,
      ...relatedTo(focusId, diagram.graph.edges),
      dimOthers: hoverId !== null && !dragging,
      selection,
      dropTargetId,
      building,
      markers: { idle: markerBase, active: `${markerBase}-active` },
    };
  }, [
    building,
    diagram.graph.edges,
    dragging,
    dropTargetId,
    hoverId,
    markerBase,
    selectedNodeId,
    selection,
  ]);

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

  // React Flow calls this once per mount: later edits never move the view.
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

  // A newly selected node hidden behind the inspector or another panel glides into view.
  const revealedId = useRef<string | null>(null);
  useEffect(() => {
    if (selectedNodeId === revealedId.current) return;
    revealedId.current = selectedNodeId;
    const box = selectedNodeId === null ? undefined : boxes.get(selectedNodeId);
    const element = containerRef.current;
    if (!box || !element) return;
    const width = element.clientWidth;
    const height = element.clientHeight;
    const cover =
      inspectorPlacement === 'side'
        ? { ...insets, right: Math.max(insets.right, SIDE_INSPECTOR_COVER) }
        : { ...insets, bottom: Math.max(insets.bottom, bottomInspectorCover()) };
    const { x, y, zoom } = flow.getViewport();
    const left = box.x * zoom + x;
    const top = box.y * zoom + y;
    const shift = (start: number, end: number, min: number, max: number) =>
      start < min ? min - start : end > max ? Math.max(max - end, min - start) : 0;
    const dx = shift(
      left,
      left + box.width * zoom,
      cover.left + REVEAL_MARGIN,
      width - cover.right - REVEAL_MARGIN,
    );
    const dy = shift(
      top,
      top + box.height * zoom,
      cover.top + REVEAL_MARGIN,
      height - cover.bottom - REVEAL_MARGIN,
    );
    if (dx !== 0 || dy !== 0) {
      void flow.setViewport({ x: x + dx, y: y + dy, zoom }, { duration: REVEAL_MS });
    }
  }, [boxes, flow, insets, inspectorPlacement, selectedNodeId]);

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

  // Dropping a connection anywhere on a component connects to it, not only on its connection point.
  const onConnectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || !state.fromNode) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!point) return;
    const element = globalThis.document
      .elementFromPoint(point.clientX, point.clientY)
      ?.closest('.react-flow__node');
    const target = element?.getAttribute('data-id');
    if (target) connectTo(state.fromNode.id, target);
  };

  const onDragOver = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes(KIND_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (event: DragEvent) => {
    const kind = event.dataTransfer.getData(KIND_MIME);
    if (!isNodeKind(kind)) return;
    event.preventDefault();
    editorStore
      .getState()
      .addNode(kind, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

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
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <svg aria-hidden="true" className="absolute size-0">
          <defs>
            <ArrowMarker id={canvas.markers.idle} color="var(--edge)" />
            <ArrowMarker id={canvas.markers.active} color="var(--accent)" />
          </defs>
        </svg>
        <ReactFlow<ArchitectureFlowNode, ArchitectureFlowEdge>
          nodes={nodes}
          edges={elements.edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
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
          onNodeDragStart={(_event, node) => {
            setHoverId(null);
            // A node picked up to be dragged is already where the pointer is.
            revealedId.current = node.id;
            editorStore.getState().select({ type: 'node', id: node.id });
          }}
          onNodeDrag={(_event, node) => setDropTargetId(dropTargetFor(node))}
          onNodeDragStop={(_event, node) => {
            editorStore.getState().moveNode(node.id, node.position);
            setDragging(null);
            setDropTargetId(null);
          }}
          onConnect={({ source, target }: Connection) => connectTo(source, target)}
          onConnectEnd={onConnectEnd}
          onNodeMouseEnter={(_event, node) => {
            if (pointerType.current !== 'touch' && node.type === 'component') setHoverId(node.id);
          }}
          onNodeMouseLeave={() => setHoverId(null)}
          onNodeClick={(_event, node) => {
            const editor = editorStore.getState();
            if (editor.connectingFrom === null) editor.select({ type: 'node', id: node.id });
            else if (editor.connectingFrom === node.id) editor.cancelConnection();
            else editor.connect(editor.connectingFrom, node.id);
          }}
          onEdgeClick={(_event, edge) =>
            editorStore.getState().select({ type: 'edge', id: edge.id })
          }
          onPaneClick={() => editorStore.getState().select(null)}
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
    </CanvasContext.Provider>
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
