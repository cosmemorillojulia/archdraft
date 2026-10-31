import { ArrowUp, Sparkles } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import { EASE_OUT } from '../motion.ts';
import { useStrings } from '../i18n/locale.ts';
import { Button } from './Button.tsx';

/** How long each example prompt stays before the next one slides in. */
const EXAMPLE_INTERVAL_MS = 3600;

/**
 * The main entry point: describe a system in words. Templates are in the header.
 * Generation needs the API (T20), so the send button stays disabled and says why.
 */
export function PromptDock() {
  const strings = useStrings();
  const inputId = useId();
  const soonId = useId();
  const [value, setValue] = useState('');

  return (
    <div className="pointer-events-auto flex w-full max-w-3xl flex-col items-center">
      <form
        onSubmit={(event) => event.preventDefault()}
        className="floating flex w-full items-end gap-2 rounded-panel p-2 pl-4 transition-shadow duration-300 focus-within:shadow-[var(--shadow-float),0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
      >
        <label htmlFor={inputId} className="sr-only">
          {strings.prompt.label}
        </label>
        <Sparkles
          size={17}
          fill="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
          className="mb-2.5 shrink-0 text-accent"
        />
        <div className="relative min-w-0 flex-1">
          <textarea
            id={inputId}
            rows={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby={soonId}
            className="field-sizing-content block max-h-40 min-h-9 w-full resize-none bg-transparent py-2 leading-normal outline-none"
          />
          {value === '' && <ExamplePrompts />}
        </div>
        <span id={soonId} className="mb-2.5 hidden shrink-0 text-xs text-muted sm:block">
          {strings.prompt.soon}
        </span>
        <Button
          type="submit"
          variant="primary"
          size="icon"
          disabled
          aria-label={strings.prompt.generate}
          title={strings.prompt.soon}
        >
          <ArrowUp size={18} aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}

/** Example prompts that take turns where the placeholder would be. Decorative only. */
function ExamplePrompts() {
  const strings = useStrings();
  const [index, setIndex] = useState(0);
  const examples = strings.prompt.examples;

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % examples.length),
      EXAMPLE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [examples.length]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden py-2 text-muted"
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={index}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="block truncate"
        >
          {examples[index]}
        </m.span>
      </AnimatePresence>
    </div>
  );
}
