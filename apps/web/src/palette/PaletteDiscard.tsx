import { isShapeKind } from '@archdraft/core';
import { Trash2 } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { createPortal } from 'react-dom';
import { useStrings } from '../i18n/locale.ts';
import { EASE_OUT } from '../motion.ts';
import { discardCarried, usePaletteDrag } from './palette-drag.ts';

/**
 * While a tile is carried, a box at the top of the screen to throw it away:
 * let it go over the box (or click it) and nothing is added. It also tells
 * how a carried tile is placed, and announces it to screen readers.
 */
export function PaletteDiscard() {
  const active = usePaletteDrag((state) => state.drag);
  const strings = useStrings();

  return createPortal(
    <AnimatePresence>
      {active && (
        <m.div
          key="discard"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12, transition: { duration: 0.12 } }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-1.5"
        >
          <button
            type="button"
            data-discard-drop
            data-over={active.overDiscard || undefined}
            onClick={discardCarried}
            className="floating pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full border-dashed px-5 text-sm font-medium transition-colors data-over:border-danger data-over:bg-danger/15 data-over:text-danger"
          >
            <Trash2 size={16} aria-hidden="true" />
            {strings.components.discard}
          </button>
          {active.mode === 'carry' && (
            <p className="floating rounded-full px-3 py-1 text-xs text-muted">
              {isShapeKind(active.kind)
                ? strings.components.carryShapeHint
                : strings.components.carryHint}
            </p>
          )}
          <span role="status" className="sr-only">
            {strings.components.carrying(strings.kinds[active.kind].label)}
          </span>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
