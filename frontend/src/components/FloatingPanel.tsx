import { type DragControls, m, type PanInfo } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT, SPRING_SLIDE } from '../motion.ts';

export type PanelPlacement = 'side' | 'bottom';

/** A panel dragged up or down from a handle of its own, like a bottom sheet. */
export interface PanelDrag {
  controls: DragControls;
  /** How far and how fast the pointer moved when it was let go; negative is up. */
  onDragEnd: (info: PanInfo) => void;
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
