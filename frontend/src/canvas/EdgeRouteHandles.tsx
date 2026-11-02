import type { EdgeRoute, EdgeStyle, Point } from '@archdraft/shared';
import type { LayoutDirection } from '../layout/compute-layout.ts';
import { useReactFlow } from '@xyflow/react';
import { type PointerEvent, type ReactNode, useRef, useState } from 'react';
import { editorStore } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';
import { type ConnectionEnds, type ConnectionShape, moveSegment } from './edge-path.ts';
import {
  type Box,
  type EdgeSides,
  edgeSides,
  type FixedSides,
  nearestSide,
  type Side,
  sidePoint,
} from './geometry.ts';

/** What a handle being dragged shows meanwhile: other sides, another node, or other points. */
export type RoutePreview =
  | { readonly kind: 'sides'; readonly sides: EdgeSides }
  | {
      readonly kind: 'reconnect';
      readonly end: 'source' | 'target';
      readonly box: Box;
      readonly sides: EdgeSides;
    }
  | { readonly kind: 'points'; readonly points: readonly Point[] };

type End = 'source' | 'target';

/** How close to the middle of a side of another node, in diagram pixels, an end is let go to arrive by that side. */
const SIDE_SNAP = 24;
/** Parts of a line shorter than this, in diagram pixels, show no handle: it would cover the corners. */
const MIN_PART = 24;
/** Pointer travel, in screen pixels, that turns a press on a handle into a drag. */
const DRAG_START = 3;

interface EdgeRouteHandlesProps {
  id: string;
  style: EdgeStyle;
  /** The sides the connection is stored with, not those a drag shows: a drop on the same side changes nothing. */
  sides: EdgeSides;
  /** The two ends of the line, on the border of the nodes. */
  source: Point;
  target: Point;
  /** Where the line is drawn now, and the points it was routed through. */
  ends: ConnectionEnds;
  shape: ConnectionShape;
  points: readonly Point[];
  sourceId: string;
  targetId: string;
  sourceBox: Box;
  targetBox: Box;
  direction: LayoutDirection;
  route: EdgeRoute | undefined;
  onPreview: (preview: RoutePreview | null) => void;
}

/** What a handle does while it is dragged and when it is let go. */
interface Drag {
  move: (point: Point) => void;
  drop: (point: Point | null) => void;
}

interface HandleSpec {
  key: string;
  label: string;
  at: Point;
  /** An end, a point of a curve, the part of a right-angled line running across or down, or a place to add a point. */
  look: 'end' | 'point' | 'across' | 'down' | 'add';
  cursor: string;
  /** Starts a drag; what the handle knows of the line is taken from when it was grabbed. */
  grab: () => Drag;
  onDoubleClick?: () => void;
}

/**
 * The handles of a selected connection, as in draw.io.
 *
 * - The dots at its ends can be dragged to another side of their node, or let go on another
 *   node to connect it there instead: by the side whose middle they are let go at, or else by
 *   the side that fits best.
 * - A right-angled line has a handle in the middle of each of its parts, which moves that
 *   part across its direction; the parts at either side stretch to follow.
 * - A curve shows the points it passes through, which move freely and go away with a double
 *   click, and a smaller dot in the middle of each part, which adds a point there when dragged.
 *
 * Nothing is stored until the handle is let go, as a single edit; a press without a drag
 * changes nothing.
 */
export function EdgeRouteHandles(props: EdgeRouteHandlesProps) {
  const strings = useStrings().canvas.edgeHandles;
  const { id, style, sides, source, target, ends, shape, points, route, onPreview } = props;
  const { sourceId, targetId, sourceBox, targetBox, direction } = props;
  const flow = useReactFlow();
  // The handle being dragged, which alone stays while the line changes under it, and where it is.
  const [active, setActive] = useState<{ key: string; at: Point } | null>(null);

  /** The sides the connection would have with `side` chosen for one of its ends. */
  const sidesWith = (end: End, side: Side | undefined, boxes = { sourceBox, targetBox }) => {
    const fixed: { source?: Side; target?: Side } = {
      ...(route?.source === undefined ? {} : { source: route.source }),
      ...(route?.target === undefined ? {} : { target: route.target }),
    };
    if (side === undefined) delete fixed[end];
    else fixed[end] = side;
    return edgeSides(boxes.sourceBox, boxes.targetBox, direction, fixed satisfies FixedSides);
  };

  /** The node a connection can end at under `point`, the frontmost, with its box. */
  const nodeAt = (point: Point): { id: string; box: Box } | null => {
    const under = flow
      .getIntersectingNodes({ x: point.x, y: point.y, width: 1, height: 1 })
      .filter((node) => node.type !== 'container');
    const node = under[under.length - 1];
    const internal = node && flow.getInternalNode(node.id);
    if (!node || !internal) return null;
    const { x, y } = internal.internals.positionAbsolute;
    const width = internal.measured.width ?? node.width ?? 0;
    const height = internal.measured.height ?? node.height ?? 0;
    return { id: node.id, box: { x, y, width, height } };
  };

  /** Where an end let go at `point` goes: another side of its node, another node, or nowhere. */
  const aim = (end: End, point: Point) => {
    const own = end === 'source' ? sourceId : targetId;
    const other = end === 'source' ? targetId : sourceId;
    const over = nodeAt(point);
    if (over === null || over.id === own) {
      return {
        kind: 'side' as const,
        side: nearestSide(end === 'source' ? sourceBox : targetBox, point),
      };
    }
    // A node is not connected to itself.
    if (over.id === other) return null;
    const near = nearestSide(over.box, point);
    const middle = sidePoint(over.box, near);
    const side = Math.hypot(middle.x - point.x, middle.y - point.y) <= SIDE_SNAP ? near : undefined;
    return { kind: 'node' as const, node: over.id, box: over.box, side };
  };

  const moveEnd = (end: End): Drag => ({
    move: (point) => {
      const target = aim(end, point);
      if (target === null) onPreview(null);
      else if (target.kind === 'side')
        onPreview({ kind: 'sides', sides: sidesWith(end, target.side) });
      else {
        const boxes = {
          sourceBox: end === 'source' ? target.box : sourceBox,
          targetBox: end === 'target' ? target.box : targetBox,
        };
        onPreview({
          kind: 'reconnect',
          end,
          box: target.box,
          sides: sidesWith(end, target.side, boxes),
        });
      }
    },
    drop: (point) => {
      onPreview(null);
      const target = point === null ? null : aim(end, point);
      if (target === null) return;
      if (target.kind === 'node') {
        editorStore.getState().reconnect(id, end, target.node, target.side);
      } else if (target.side !== sides[end]) {
        // A route kept as a shift of its middle was made for the old side; points stay where they are.
        editorStore.getState().setEdgeRoute(id, { [end]: target.side, bend: undefined });
      }
    },
  });

  /** A drag that shows the line through other points, and stores them when let go. */
  const reshape = (pointsAt: (point: Point) => readonly Point[]): Drag => ({
    move: (point) => onPreview({ kind: 'points', points: pointsAt(point) }),
    drop: (point) => {
      onPreview(null);
      if (point === null) return;
      const next = pointsAt(point);
      editorStore
        .getState()
        .setEdgeRoute(id, { points: next.length === 0 ? undefined : next, bend: undefined });
    },
  });

  const handles: HandleSpec[] = [
    {
      key: 'source',
      label: strings.source,
      at: source,
      look: 'end',
      cursor: 'cursor-grab',
      grab: () => moveEnd('source'),
    },
    {
      key: 'target',
      label: strings.target,
      at: target,
      look: 'end',
      cursor: 'cursor-grab',
      grab: () => moveEnd('target'),
    },
  ];
  const { corners, midpoints } = shape;
  const partLength = (index: number) => {
    const from = corners[index] as Point;
    const to = corners[index + 1] as Point;
    return Math.hypot(to.x - from.x, to.y - from.y);
  };
  if (style === 'square') {
    midpoints.forEach((at, index) => {
      if (partLength(index) < MIN_PART) return;
      const across = Math.abs((corners[index] as Point).y - (corners[index + 1] as Point).y) < 1;
      handles.push({
        key: `segment-${index}`,
        label: strings.segment,
        at,
        look: across ? 'across' : 'down',
        cursor: across ? 'cursor-ns-resize' : 'cursor-ew-resize',
        grab: () => {
          const grabbed = { ends, corners };
          return reshape((point) => moveSegment(grabbed.ends, grabbed.corners, index, point));
        },
      });
    });
  } else {
    points.forEach((at, index) => {
      handles.push({
        key: `point-${index}`,
        label: strings.point,
        at,
        look: 'point',
        cursor: 'cursor-move',
        grab: () => {
          const grabbed = [...points];
          return reshape((point) => grabbed.map((other, at) => (at === index ? point : other)));
        },
        onDoubleClick: () =>
          editorStore.getState().setEdgeRoute(id, {
            points: points.filter((_, at) => at !== index),
            bend: undefined,
          }),
      });
    });
    midpoints.forEach((at, index) => {
      if (partLength(index) < MIN_PART * 2) return;
      handles.push({
        key: `add-${index}`,
        label: strings.addPoint,
        at,
        look: 'add',
        cursor: 'cursor-copy',
        grab: () => {
          const grabbed = [...points];
          return reshape((point) => [...grabbed.slice(0, index), point, ...grabbed.slice(index)]);
        },
      });
    });
  }

  const toFlow = (event: PointerEvent): Point =>
    flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });

  return (
    <>
      {handles.map(({ key, ...handle }) => {
        // While a handle is dragged, the others belong to a line that is changing: they wait.
        if (active !== null && active.key !== key && handle.look !== 'end') return null;
        const at = active?.key === key && handle.look !== 'end' ? active.at : handle.at;
        return (
          <Dot
            key={key}
            {...handle}
            at={at}
            toFlow={toFlow}
            onActive={(point) => setActive(point === null ? null : { key, at: point })}
          />
        );
      })}
    </>
  );
}

interface DotProps extends Omit<HandleSpec, 'key'> {
  toFlow: (event: PointerEvent) => Point;
  /** Where the dot is dragged to, or null when it is let go. */
  onActive: (point: Point | null) => void;
}

/** A dot over the canvas that follows the pointer while it is held down. */
function Dot(props: DotProps): ReactNode {
  const { label, at, look, cursor, grab, onDoubleClick, toFlow, onActive } = props;
  const held = useRef<{ drag: Drag | null; x: number; y: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  const finish = (event: PointerEvent, cancelled: boolean) => {
    const state = held.current;
    if (!state) return;
    held.current = null;
    setPressed(false);
    onActive(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    // A press that did not become a drag changes nothing.
    state.drag?.drop(cancelled ? null : toFlow(event));
  };
  const dot = {
    end: 'size-2.5 border-2 bg-accent',
    point: 'size-2.5 border-2 bg-surface',
    // A pill along the part it moves.
    across: 'h-2 w-4 border-2 bg-surface',
    down: 'h-4 w-2 border-2 bg-surface',
    add: 'size-2 border-[1.5px] bg-surface opacity-60',
  }[look];
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      data-active={pressed || undefined}
      className={`nodrag nopan group/dot pointer-events-auto absolute flex size-6 touch-none items-center justify-center ${cursor}`}
      style={{ transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        held.current = { drag: null, x: event.clientX, y: event.clientY };
        setPressed(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        const state = held.current;
        if (!state) return;
        if (state.drag === null) {
          if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < DRAG_START) return;
          state.drag = grab();
        }
        const point = toFlow(event);
        onActive(point);
        state.drag.move(point);
      }}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick?.();
      }}
    >
      <span
        aria-hidden="true"
        className={`rounded-full border-accent shadow-sm transition-[transform,opacity] duration-150 ease-out-soft group-hover/dot:scale-125 group-hover/dot:opacity-100 ${dot} ${
          pressed ? 'scale-125 opacity-100' : ''
        }`}
      />
    </div>
  );
}
