import { Eye } from 'lucide-react';
import { m } from 'motion/react';
import type { ChangeMark } from '../ai/assistant-store.ts';
import { useStrings } from '../i18n/locale.ts';
import { EASE_OUT } from '../motion.ts';
import { MARK_COLOR } from './appearance.ts';

const MARKS: readonly ChangeMark[] = ['added', 'updated', 'removed'];

/**
 * Says, over the top of the canvas, that what it shows is a proposal and not
 * the diagram yet, and what each colour of it means. Centred in the space the
 * panels leave free.
 */
export function PreviewLegend({ top, left, right }: { top: number; left: number; right: number }) {
  const strings = useStrings();
  return (
    <div
      className="pointer-events-none absolute z-10 flex justify-center px-4"
      style={{ top: top + 12, left, right }}
    >
      <m.div
        role="status"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="floating flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full px-3.5 py-1.5 text-xs"
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
    </div>
  );
}
