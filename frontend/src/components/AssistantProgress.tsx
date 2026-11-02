import { ChevronDown } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';
import { useAssistant } from '../ai/assistant-store.ts';
import { useStrings } from '../i18n/locale.ts';
import { EASE_OUT } from '../motion.ts';

/** Components shown by name; the ones before are counted. */
const SHOWN_COMPONENTS = 6;
/** Characters of reasoning kept on screen: a few lines, its end. */
const SHOWN_THOUGHT = 420;

/**
 * The assistant at work, above the prompt: what it is doing and for how long, the end of its
 * reasoning as it thinks, for the models that show theirs, and the components of the answer
 * as it writes them. The reasoning can be folded away; only the stage is announced.
 */
export function AssistantProgress() {
  const strings = useStrings();
  const working = useAssistant((state) => state.working);
  const progress = useAssistant((state) => state.progress);
  const [thoughtOpen, setThoughtOpen] = useState(true);
  const seconds = useElapsed(progress?.startedAt);

  const thought = progress?.thought.trim().slice(-SHOWN_THOUGHT) ?? '';
  const components = progress?.components ?? [];
  const hidden = Math.max(components.length - SHOWN_COMPONENTS, 0);

  return (
    <AnimatePresence>
      {working !== null && progress !== null && (
        <m.div
          key="progress"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="floating mb-2 flex w-full flex-col gap-2 rounded-panel px-4 py-3"
        >
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex shrink-0 gap-1">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-1.5 rounded-full bg-accent motion-safe:animate-pulse"
                  style={{ animationDelay: `${dot * 180}ms` }}
                />
              ))}
            </span>
            <p role="status" className="shimmer-text min-w-0 flex-1 truncate text-sm font-medium">
              {strings.assistant.stages[progress.stage]}
            </p>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {strings.assistant.elapsed(seconds)}
            </span>
            {thought !== '' && (
              <button
                type="button"
                aria-expanded={thoughtOpen}
                onClick={() => setThoughtOpen((open) => !open)}
                className="-mr-1.5 flex shrink-0 items-center gap-1 rounded-control px-1.5 py-0.5 text-xs text-muted transition-colors hover:text-ink"
              >
                {thoughtOpen ? strings.assistant.hideThought : strings.assistant.showThought}
                <ChevronDown
                  size={13}
                  aria-hidden="true"
                  className={`transition-transform duration-200 ${thoughtOpen ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
          {thought !== '' && thoughtOpen && (
            // Its end stays in view as it grows; the lines before fade out at the top.
            <div
              aria-live="off"
              className="flex h-[3.9rem] flex-col justify-end overflow-hidden text-xs leading-[1.3rem] whitespace-pre-line text-muted [mask-image:linear-gradient(to_bottom,transparent,black_45%)]"
            >
              <p>{thought}</p>
            </div>
          )}
          {components.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">
                {strings.assistant.componentsDrawn(components.length)}
              </span>
              {hidden > 0 && <span className="text-xs text-muted">· +{hidden}</span>}
              {components.slice(hidden).map((name, index) => (
                <m.span
                  key={`${hidden + index}-${name}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.18, ease: EASE_OUT }}
                  className="max-w-40 truncate rounded-full border border-line bg-surface px-2 py-0.5 text-xs"
                >
                  {name}
                </m.span>
              ))}
            </div>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** Whole seconds since `since`, counted every second; 0 without it. */
function useElapsed(since: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === undefined) return;
    // A clock older than `since` counts as 0 until the first tick.
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since === undefined ? 0 : Math.max(Math.floor((now - since) / 1000), 0);
}
