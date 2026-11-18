import { AnimatePresence, type DragControls, m, type PanInfo } from 'motion/react';
import { type ReactNode, useRef } from 'react';
import { EASE_OUT, SPRING_SLIDE } from '../motion.ts';

export type PanelPlacement = 'side' | 'bottom';

/** A panel dragged up or down from a handle of its own, like a bottom sheet. */
export interface PanelDrag {
  controls: DragControls;
  /** How far and how fast the pointer moved when it was let go; negative is up. */
  onDragEnd: (info: PanInfo) => void;
}

/** Cross-fade between two contents of a panel, such as its strip and its full form. */
const SWAP = { duration: 0.15, ease: EASE_OUT };

/** Distance in pixels, or speed in pixels per second, that expands or collapses a sheet. */
const SHEET_DRAG_DISTANCE = 40;
const SHEET_DRAG_VELOCITY = 300;
/** Pointer movement in pixels below which a press on the handle counts as a tap. */
const TAP_SLOP = 6;

/** The drag of a sheet that folds into a strip: up expands it, down collapses it. */
export function sheetDrag(
  controls: DragControls,
  onExpand: (expanded: boolean) => void,
): PanelDrag {
  return {
    controls,
    onDragEnd: ({ offset, velocity }) => {
      const up = offset.y < -SHEET_DRAG_DISTANCE || velocity.y < -SHEET_DRAG_VELOCITY;
      const down = offset.y > SHEET_DRAG_DISTANCE || velocity.y > SHEET_DRAG_VELOCITY;
      if (up !== down) onExpand(up);
    },
  };
}

interface FloatingPanelProps {
  /** Beside the diagram on wide screens; across the bottom on narrow ones. */
  placement: PanelPlacement;
  labelledBy: string;
  /** With it, the panel follows the handle a little and animates its changes of size. */
  drag?: PanelDrag;
  children: ReactNode;
}

/**
 * The radius of `rounded-panel` (--radius-panel), set as a style when the
 * panel animates its size: Motion only keeps round the corners it knows.
 */
const PANEL_RADIUS = 16;

/**
 * Shell of the panels that share the slot under the diagram card: the
 * inspector and the design review. It slides in from the right on wide
 * screens and from the bottom on narrow ones; the parent AnimatePresence
 * plays its exit.
 */
export function FloatingPanel({ placement, labelledBy, drag, children }: FloatingPanelProps) {
  const offset = placement === 'side' ? { x: 24, y: 0 } : { x: 0, y: 24 };
  return (
    <m.section
      aria-labelledby={labelledBy}
      initial={{ opacity: 0, ...offset }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...offset, transition: { duration: 0.16, ease: EASE_OUT } }}
      transition={SPRING_SLIDE}
      {...(drag && {
        layout: true,
        drag: 'y',
        dragControls: drag.controls,
        dragListener: false,
        dragConstraints: { top: 0, bottom: 0 },
        dragElastic: 0.2,
        onDragEnd: (_event, info) => drag.onDragEnd(info),
        style: { borderRadius: PANEL_RADIUS },
      })}
      className={`floating pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-panel ${
        placement === 'side' ? 'max-h-full' : 'max-h-[min(52dvh,480px)]'
      }`}
    >
      {children}
    </m.section>
  );
}

/**
 * Grip at the top of a sheet that folds into a strip. Dragging it up or down
 * moves the whole panel (`sheetDrag`); a tap, or Enter, toggles it.
 */
export function SheetHandle({
  expanded,
  controls,
  label,
  onExpand,
}: {
  expanded: boolean;
  controls: DragControls;
  /** What a tap does now: expand or collapse. */
  label: string;
  onExpand: (expanded: boolean) => void;
}) {
  const pressedAt = useRef(0);
  return (
    <m.button
      type="button"
      // Kept undistorted while the panel changes size.
      layout="position"
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        pressedAt.current = event.clientY;
        controls.start(event);
      }}
      onClick={(event) => {
        // A drag ends with a click too; only a press that stayed put, or a key, toggles.
        const tapped = event.detail === 0 || Math.abs(event.clientY - pressedAt.current) < TAP_SLOP;
        if (tapped) onExpand(!expanded);
      }}
      className="group flex w-full shrink-0 cursor-grab touch-none justify-center rounded-t-panel pt-2 pb-1 focus-visible:-outline-offset-2 active:cursor-grabbing"
    >
      <span
        aria-hidden="true"
        className="h-1 w-9 rounded-full bg-line transition-colors group-hover:bg-muted"
      />
    </m.button>
  );
}

/**
 * The contents of a panel, which cross-fade when `contentKey` changes. In a
 * sheet that changes size, the old content leaves at once and the new one
 * follows.
 */
export function PanelContent({
  contentKey,
  sheet,
  children,
}: {
  contentKey: string;
  sheet: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.div
        key={contentKey}
        layout={sheet ? 'position' : false}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { ...SWAP, ...(sheet && { delay: 0.06 }) } }}
        exit={{ opacity: 0, transition: sheet ? { duration: 0.06 } : SWAP }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
