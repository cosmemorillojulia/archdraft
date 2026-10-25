import { m } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT, SPRING_SLIDE } from '../motion.ts';

export type PanelPlacement = 'side' | 'bottom';

interface FloatingPanelProps {
  /** Beside the diagram on wide screens; across the bottom on narrow ones. */
  placement: PanelPlacement;
  labelledBy: string;
  children: ReactNode;
}

/**
 * Shell of the panels that share the slot under the diagram card: the
 * inspector and the design review. It slides in from the right on wide
 * screens and from the bottom on narrow ones; the parent AnimatePresence
 * plays its exit.
 */
export function FloatingPanel({ placement, labelledBy, children }: FloatingPanelProps) {
  const offset = placement === 'side' ? { x: 24, y: 0 } : { x: 0, y: 24 };
  return (
    <m.section
      aria-labelledby={labelledBy}
      initial={{ opacity: 0, ...offset }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, ...offset, transition: { duration: 0.16, ease: EASE_OUT } }}
      transition={SPRING_SLIDE}
      className={`floating pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-panel ${
        placement === 'side' ? 'max-h-full' : 'max-h-[min(52dvh,480px)]'
      }`}
    >
      {children}
    </m.section>
  );
}
