import {
  ArrowUp,
  FilePlus2,
  LoaderCircle,
  type LucideIcon,
  Minimize2,
  ShieldCheck,
  Sparkles,
  Square,
  WandSparkles,
} from 'lucide-react';
import type { OfferTask } from '@archdraft/shared';
import { AnimatePresence, m } from 'motion/react';
import { type KeyboardEvent, useEffect, useId, useState } from 'react';
import { useAssistant } from '../ai/assistant-store.ts';
import { PreviewLegend } from '../ai/PreviewLegend.tsx';
import { apiUrl } from '../ai/client.ts';
import { cancelAssistant, runAssistant } from '../ai/run-assistant.ts';
import { useEditor } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';
import type { LayoutDirection } from '../layout/compute-layout.ts';
import { EASE_OUT } from '../motion.ts';
import { AssistantProgress } from './AssistantProgress.tsx';
import { Button } from './Button.tsx';
import { MENU_ITEM, MENU_MOTION, useMenu } from './menu.ts';

/** How long each example prompt stays before the next one slides in. */
const EXAMPLE_INTERVAL_MS = 3600;

const OFFER_TASKS: readonly OfferTask[] = ['improve', 'simplify', 'extend'];
const OFFER_ICONS = {
  improve: ShieldCheck,
  simplify: Minimize2,
  extend: WandSparkles,
} satisfies Record<OfferTask, LucideIcon>;

/**
 * The main entry point: describe a system in words. On an empty diagram the
 * description creates one; on a diagram with content it asks for a change,
 * unless "New diagram" is on. The assistant menu asks for improvements or
 * for a simpler or a more complete design. Without an API in this build the
 * send button stays disabled and says why. Templates are in the header.
 */
export function PromptDock({ direction }: { direction: LayoutDirection }) {
  const strings = useStrings();
  const inputId = useId();
  const noteId = useId();
  const [value, setValue] = useState('');
  const [fresh, setFresh] = useState(false);
  const available = apiUrl() !== undefined;
  const hasContent = useEditor((state) => (state.current?.document.graph.nodes.length ?? 0) > 0);
  const working = useAssistant((state) => state.working);
  // Without the assistant there is nothing to change: the dock only says what it would do.
  const creating = !available || !hasContent || fresh;
  const prompt = value.trim();

  const submit = () => {
    if (!available || working !== null || prompt === '') return;
    void runAssistant(creating ? 'generate' : 'edit', prompt, direction);
    setValue('');
    setFresh(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape' && working !== null) {
      event.preventDefault();
      cancelAssistant();
    }
  };

  const label = creating ? strings.prompt.label : strings.assistant.editLabel;
  const examples = creating ? strings.prompt.examples : strings.assistant.editExamples;

  return (
    <div className="pointer-events-auto flex w-full max-w-3xl flex-col items-center">
      <PreviewLegend />
      <AssistantProgress />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        aria-busy={working !== null}
        className="floating flex w-full items-end gap-2 rounded-panel p-2 pl-4 transition-shadow duration-300 focus-within:shadow-[var(--shadow-float),0_0_0_4px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
      >
        <label htmlFor={inputId} className="sr-only">
          {label}
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
            onKeyDown={onKeyDown}
            readOnly={working !== null}
            aria-describedby={noteId}
            className="field-sizing-content block max-h-40 min-h-9 w-full resize-none bg-transparent py-2 leading-normal outline-none"
          />
          {working !== null ? (
            <p
              role="status"
              className="pointer-events-none absolute inset-0 flex items-center gap-2 py-2 text-muted"
            >
              <LoaderCircle
                size={15}
                aria-hidden="true"
                className="shrink-0 motion-safe:animate-spin"
              />
              <span className="truncate">{strings.assistant.working[working]}</span>
            </p>
          ) : (
            // A new key starts the examples of the other mode from the first.
            value === '' && (
              <ExamplePrompts key={creating ? 'create' : 'edit'} examples={examples} />
            )
          )}
        </div>
        <span
          id={noteId}
          className={available ? 'sr-only' : 'mb-2.5 hidden shrink-0 text-xs text-muted sm:block'}
        >
          {available ? strings.assistant.newDiagramHint : strings.prompt.unavailable}
        </span>
        {available && hasContent && (
          <Button
            type="button"
            variant="ghost"
            aria-pressed={fresh}
            title={strings.assistant.newDiagramHint}
            disabled={working !== null}
            onClick={() => setFresh((current) => !current)}
            className="mb-0.5 h-8 shrink-0 px-2.5 text-[13px] aria-pressed:bg-accent/10 aria-pressed:text-accent max-sm:size-8 max-sm:px-0"
          >
            <FilePlus2 size={15} aria-hidden="true" />
            <span className="max-sm:sr-only">{strings.assistant.newDiagram}</span>
          </Button>
        )}
        {available && (
          <AssistantMenu direction={direction} disabled={!hasContent || working !== null} />
        )}
        {working !== null ? (
          <Button
            type="button"
            variant="primary"
            size="icon"
            aria-label={strings.assistant.stop}
            title={strings.assistant.stop}
            onClick={cancelAssistant}
          >
            <Square size={14} fill="currentColor" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            size="icon"
            disabled={!available || prompt === ''}
            aria-label={creating ? strings.prompt.generate : strings.assistant.edit}
            title={available ? undefined : strings.prompt.unavailable}
          >
            <ArrowUp size={18} aria-hidden="true" />
          </Button>
        )}
      </form>
    </div>
  );
}

/** Asks the assistant for proposals on the open diagram. */
function AssistantMenu({ direction, disabled }: { direction: LayoutDirection; disabled: boolean }) {
  const strings = useStrings();
  const { open, close, buttonProps, menuProps } = useMenu();

  return (
    <div className="relative shrink-0">
      <Button
        {...buttonProps}
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={strings.assistant.menu}
        title={strings.assistant.menu}
      >
        <WandSparkles size={17} aria-hidden="true" />
      </Button>
      <AnimatePresence>
        {open && !disabled && (
          <m.div
            {...menuProps}
            {...MENU_MOTION}
            aria-label={strings.assistant.menu}
            style={{ transformOrigin: 'bottom right' }}
            className="floating absolute right-0 bottom-full z-50 mb-3 w-72 rounded-panel p-1.5"
          >
            {OFFER_TASKS.map((task) => {
              const Icon = OFFER_ICONS[task];
              return (
                <button
                  key={task}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close(false);
                    void runAssistant(task, undefined, direction);
                  }}
                  className={`${MENU_ITEM} items-start`}
                >
                  <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{strings.assistant.actions[task]}</span>
                    <span className="block text-xs text-muted">
                      {strings.assistant.actionHints[task]}
                    </span>
                  </span>
                </button>
              );
            })}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Example prompts that take turns where the placeholder would be. Decorative only. */
function ExamplePrompts({ examples }: { examples: readonly string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % examples.length),
      EXAMPLE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [examples]);

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
