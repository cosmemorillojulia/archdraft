import { LayoutGrid, Shapes, Sparkles } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useId } from 'react';
import { useAssistant } from '../ai/assistant-store.ts';
import { apiUrl } from '../ai/client.ts';
import { runAssistant } from '../ai/run-assistant.ts';
import { Button } from '../components/Button.tsx';
import { useEditor } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';
import type { LayoutDirection } from '../layout/compute-layout.ts';
import { EASE_OUT } from '../motion.ts';
import { dialogStore } from './dialog-store.ts';

/** Example prompts offered on an empty diagram. */
const SHOWN_EXAMPLES = 3;

interface EmptyStateProps {
  direction: LayoutDirection;
  onShowComponents: () => void;
}

/**
 * What to do with an empty diagram, in the middle of the canvas: describe it (with examples that
 * the assistant draws at a click), start from a template or add components by hand. It goes as
 * soon as the diagram has something, a template is opening or the assistant is at work. Without
 * the assistant, it offers only the other two.
 */
export function EmptyState({ direction, onShowComponents }: EmptyStateProps) {
  const strings = useStrings();
  const titleId = useId();
  const empty = useEditor(
    (state) => state.opening === null && state.current?.document.graph.nodes.length === 0,
  );
  const busy = useAssistant((state) => state.working !== null);
  const available = apiUrl() !== undefined;

  return (
    <AnimatePresence>
      {empty && !busy && (
        <m.section
          key="empty"
          aria-labelledby={titleId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className="pointer-events-auto flex w-full max-w-md flex-col items-center gap-4 text-center"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {strings.empty.title}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {available ? strings.empty.withAssistant : strings.empty.withoutAssistant}
            </p>
          </div>
          {available && (
            <ul aria-label={strings.empty.examples} className="flex w-full flex-col gap-2">
              {strings.prompt.examples.slice(0, SHOWN_EXAMPLES).map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => void runAssistant('generate', example, direction)}
                    className="floating w-full rounded-control px-3.5 py-2.5 text-left text-sm transition-colors hover:text-accent"
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => dialogStore.getState().show('templates')}>
              <LayoutGrid size={16} aria-hidden="true" />
              {strings.empty.templates}
            </Button>
            {/* On phones the button that opens the components is right below. */}
            <Button variant="secondary" onClick={onShowComponents} className="max-md:hidden">
              <Shapes size={16} aria-hidden="true" />
              {strings.empty.components}
            </Button>
          </div>
        </m.section>
      )}
    </AnimatePresence>
  );
}
