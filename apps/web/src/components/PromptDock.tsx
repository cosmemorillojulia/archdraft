import { TEMPLATE_IDS, type TemplateId } from '@archdraft/core';
import { ArrowUp, Sparkles } from 'lucide-react';
import { useId } from 'react';
import { strings } from '../strings.ts';
import { Button } from './Button.tsx';

interface PromptDockProps {
  templateId: TemplateId;
  onTemplateChange: (id: TemplateId) => void;
}

/**
 * The main entry point: describe a system in words or start from a template.
 * Generation needs the API (T20), so the send button stays disabled and says why.
 */
export function PromptDock({ templateId, onTemplateChange }: PromptDockProps) {
  const inputId = useId();
  const soonId = useId();
  return (
    <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2.5">
      <form
        onSubmit={(event) => event.preventDefault()}
        className="floating flex items-end gap-2 rounded-panel p-2 pl-4"
      >
        <label htmlFor={inputId} className="sr-only">
          {strings.prompt.label}
        </label>
        <Sparkles size={17} aria-hidden="true" className="mb-2.5 shrink-0 text-accent" />
        <textarea
          id={inputId}
          rows={1}
          placeholder={strings.prompt.placeholder}
          aria-describedby={soonId}
          className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 leading-normal outline-none placeholder:text-muted"
        />
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
      <div
        role="group"
        aria-label={strings.prompt.templates}
        className="flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:overflow-visible"
      >
        {TEMPLATE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === templateId}
            onClick={() => onTemplateChange(id)}
            className="floating shrink-0 rounded-full px-3.5 py-1.5 text-[0.8125rem] whitespace-nowrap text-muted transition-colors hover:text-ink aria-pressed:border-accent aria-pressed:text-ink"
          >
            {strings.prompt.templateNames[id]}
          </button>
        ))}
      </div>
    </div>
  );
}
