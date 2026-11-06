import { Eye } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { MARK_COLOR } from '../canvas/appearance.ts';
import { useStrings } from '../i18n/locale.ts';
import { EASE_OUT } from '../motion.ts';
import { type ChangeMark, useAssistant } from './assistant-store.ts';

const MARKS: readonly ChangeMark[] = ['added', 'updated', 'removed'];

/**
 * While a proposal is drawn on the canvas, says that it is not the diagram yet and what each
 * colour of it means. It sits at the bottom, above the prompt or the panel, where the cards at
 * the top of the canvas cannot cover it.
 */
export function PreviewLegend() {
  const strings = useStrings();
  const previewing = useAssistant((state) => state.preview !== null);
  return (
    <AnimatePresence>
      {previewing && (
        <m.div
          key="legend"
          role="status"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="floating pointer-events-none mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full px-3.5 py-1.5 text-xs"
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <Eye size={14} aria-hidden="true" className="text-accent" />
            {strings.assistant.previewing}
          </span>
          {MARKS.map((mark) => (
            <span key={mark} className="flex items-center gap-1.5 text-muted">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: MARK_COLOR[mark] }}
              />
              {strings.assistant.marks[mark]}
            </span>
          ))}
        </m.div>
      )}
    </AnimatePresence>
  );
}
