import type { EdgeRoute, Point } from '@archdraft/core';
import type { LayoutDirection } from '@archdraft/layout';
import { useReactFlow } from '@xyflow/react';
import { type PointerEvent, type ReactNode, useRef, useState } from 'react';
import { editorStore } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';
import type { BendHandle } from './edge-path.ts';
import {
  type Box,
  type EdgeSides,
  edgeSides,
  type FixedSides,
  nearestSide,
  type Side,
} from './geometry.ts';

/** What a handle being dragged shows meanwhile: other sides, or a moved middle. */
export type RoutePreview =
  | { readonly kind: 'sides'; readonly sides: EdgeSides }
  | { readonly kind: 'bend'; readonly bend: Point };

interface EdgeRouteHandlesProps {
  id: string;
  /** The sides the connection is stored with, not those a drag shows: a drop on the same side changes nothing. */
  sides: EdgeSides;
  /** The two ends of the line, on the border of the nodes, and where the middle falls by default. */
  source: Point;
  target: Point;
  home: BendHandle | null;
  /** The handle of the middle, where it is drawn now. */
  bend: BendHandle | null;
  sourceBox: Box;
  targetBox: Box;
  direction: LayoutDirection;
  route: EdgeRoute | undefined;
  onPreview: (preview: RoutePreview | null) => void;
}

/**
 * The dots of a selected connection. The two at its ends can be dragged to another side of
 * their node, and the one in the middle moves the middle of the line: a curve is bent
 * through it, and a right-angled line moves the segment that crosses the middle, in the one
 * direction it can go. Nothing is stored until the dot is let go, as a single edit.
 */
export function EdgeRouteHandles(props: EdgeRouteHandlesProps) {
  const strings = useStrings().canvas.edgeHandles;
  const { id, sides, source, target, home, bend, sourceBox, targetBox, direction, route } = props;
  const { onPreview } = props;
  const flow = useReactFlow();

  /** The sides the connection would have with `side` chosen for one of its ends. */
  const sidesWith = (end: 'source' | 'target', side: Side): EdgeSides => {
    const fixed: { source?: Side; target?: Side } = {
      ...(route?.source === undefined ? {} : { source: route.source }),
      ...(route?.target === undefined ? {} : { target: route.target }),
    };
    fixed[end] = side;
    return edgeSides(sourceBox, targetBox, direction, fixed satisfies FixedSides);
  };

  const moveEnd = (end: 'source' | 'target') => ({
    move: (point: Point) =>
      onPreview({
        kind: 'sides',
        sides: sidesWith(end, nearestSide(end === 'source' ? sourceBox : targetBox, point)),
      }),
    drop: (point: Point | null) => {
      onPreview(null);
      if (point === null) return;
      const side = nearestSide(end === 'source' ? sourceBox : targetBox, point);
      if (side === sides[end]) return;
      // The other end may move to keep the line short, and a bend would no longer fit.
      editorStore.getState().setEdgeRoute(id, { [end]: side, bend: undefined });
    },
  });

  const moveBend = {
    move: (point: Point) => {
      if (home) onPreview({ kind: 'bend', bend: bendTo(home, point) });
    },
    drop: (point: Point | null) => {
      onPreview(null);
      if (point !== null && home) {
        editorStore.getState().setEdgeRoute(id, { bend: bendTo(home, point) });
      }
    },
  };

  const toFlow = (event: PointerEvent): Point =>
    flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });

  const sourceDrag = moveEnd('source');
  const targetDrag = moveEnd('target');
  return (
    <>
      <Dot
        label={strings.source}
        at={source}
        cursor="cursor-grab"
        toFlow={toFlow}
        {...sourceDrag}
      />
      <Dot
        label={strings.target}
        at={target}
        cursor="cursor-grab"
        toFlow={toFlow}
        {...targetDrag}
      />
      {bend && home && (
        <Dot
          label={strings.bend}
          at={bend}
          hollow
          cursor={
            bend.axes === 'x'
              ? 'cursor-ew-resize'
              : bend.axes === 'y'
                ? 'cursor-ns-resize'
                : 'cursor-move'
          }
          toFlow={toFlow}
          {...moveBend}
        />
      )}
    </>
  );
}

/**
 * How far the middle of a line is from where it falls by default, when the pointer has it at
 * `point`: in both directions for a curve, in the only one the line can move for right angles.
 */
function bendTo(home: BendHandle, point: Point): Point {
  return {
    x: home.axes === 'y' ? 0 : point.x - home.x,
    y: home.axes === 'x' ? 0 : point.y - home.y,
  };
}

interface DotProps {
  label: string;
  at: Point;
  hollow?: boolean;
  cursor: string;
  toFlow: (event: PointerEvent) => Point;
  move: (point: Point) => void;
  drop: (point: Point | null) => void;
}

/** A dot over the canvas that follows the pointer while it is held down. */
function Dot({ label, at, hollow = false, cursor, toFlow, move, drop }: DotProps): ReactNode {
  const held = useRef(false);
  const [active, setActive] = useState(false);
  const finish = (event: PointerEvent, cancelled: boolean) => {
    if (!held.current) return;
    held.current = false;
    setActive(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drop(cancelled ? null : toFlow(event));
  };
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      data-active={active || undefined}
      className={`nodrag nopan pointer-events-auto absolute flex size-6 touch-none items-center justify-center ${cursor}`}
      style={{ transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        held.current = true;
        setActive(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (held.current) move(toFlow(event));
      }}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)}
    >
      <span
        aria-hidden="true"
        className={`size-2.5 rounded-full border-2 border-accent shadow-sm transition-transform duration-150 ease-out-soft ${
          hollow ? 'bg-surface' : 'bg-accent'
        } ${active ? 'scale-125' : ''}`}
      />
    </div>
  );
}
