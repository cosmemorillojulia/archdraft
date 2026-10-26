import { TEMPLATE_IDS, type TemplateId } from '@archdraft/core';
import {
  Bot,
  Check,
  ChartColumn,
  ChevronDown,
  CloudCog,
  Layers,
  Plus,
  type LucideIcon,
  Newspaper,
  Workflow,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { openBlank, openTemplate } from '../editor/open-document.ts';
import { useEditor } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';
import { useMediaQuery, WIDE_SCREEN } from '../media.ts';
import { EASE_OUT } from '../motion.ts';
import { Button } from './Button.tsx';

const TEMPLATE_ICONS = {
  'three-tier-web': Layers,
  'serverless-api': CloudCog,
  'event-driven-microservices': Workflow,
  'rag-chatbot': Bot,
  'analytics-pipeline': ChartColumn,
  'static-site-cms': Newspaper,
} satisfies Record<TemplateId, LucideIcon>;

/**
 * Header button with a menu of the starting templates. The one the diagram
 * was opened from is checked. Choosing one replaces the diagram, which the
 * history can undo.
 */
export function TemplatesMenu() {
  const strings = useStrings();
  const templateId = useEditor((state) => state.opening ?? state.current?.templateId ?? null);
  // Templates are laid out in the direction that suits the screen, as on first load.
  const wide = useMediaQuery(WIDE_SCREEN);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  // A press outside the button and the menu closes it.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Opening puts the focus on the checked template, or on the first.
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    const checked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      // Handled here, so the editor does not also clear its selection.
      event.preventDefault();
      close(true);
      return;
    }
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = items.indexOf(globalThis.document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  };

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="max-md:size-7 max-md:px-0"
      >
        <Plus size={17} aria-hidden="true" />
        <span className="max-md:sr-only">{strings.header.new}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform duration-200 max-md:hidden ${open ? 'rotate-180' : ''}`}
        />
      </Button>
      <AnimatePresence>
        {open && (
          <m.div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={strings.header.new}
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: -6,
              scale: 0.97,
              transition: { duration: 0.14, ease: EASE_OUT },
            }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            style={{ transformOrigin: 'top left' }}
            className="floating absolute top-full left-0 z-50 mt-2 w-60 rounded-panel p-1.5 max-md:fixed max-md:top-14 max-md:left-3"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openBlank(wide ? 'LR' : 'TB');
                close(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors duration-150 outline-none hover:bg-ink/6 focus-visible:bg-ink/6"
            >
              <Plus size={16} aria-hidden="true" className="shrink-0" />
              {strings.header.newDiagram}
            </button>
            <div role="separator" className="mx-2 my-1.5 h-px bg-line" />
            <p className="px-2.5 pb-1 text-xs font-medium text-muted">{strings.prompt.templates}</p>
            {TEMPLATE_IDS.map((id) => {
              const Icon = TEMPLATE_ICONS[id];
              const active = id === templateId;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    void openTemplate(id, wide ? 'LR' : 'TB');
                    close(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 outline-none hover:bg-ink/6 focus-visible:bg-ink/6 aria-checked:font-semibold aria-checked:text-accent"
                >
                  <Icon size={16} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {strings.prompt.templateNames[id]}
                  </span>
                  {active && <Check size={15} aria-hidden="true" className="shrink-0" />}
                </button>
              );
            })}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
