import { TEMPLATE_IDS } from '@archdraft/shared';
import { Check, ChevronDown, LayoutGrid, Plus } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { openBlank, openTemplate } from '../editor/open-document.ts';
import { useEditor } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';
import { useMediaQuery, WIDE_SCREEN } from '../media.ts';
import { dialogStore } from '../onboarding/dialog-store.ts';
import { TEMPLATE_ICONS } from '../onboarding/template-icons.ts';
import { Button } from './Button.tsx';
import { MENU_ITEM, MENU_MOTION, useMenu } from './menu.ts';

/**
 * Header button with a menu of the starting templates, and a way to the gallery
 * that describes them. The one the diagram was opened from is checked.
 * Choosing one replaces the diagram, which the history can undo.
 */
export function TemplatesMenu() {
  const strings = useStrings();
  const templateId = useEditor((state) => state.opening ?? state.current?.templateId ?? null);
  // Templates are laid out in the direction that suits the screen, as on first load.
  const wide = useMediaQuery(WIDE_SCREEN);
  const { open, close, buttonProps, menuProps } = useMenu();

  return (
    <div className="relative">
      <Button {...buttonProps} variant="ghost" className="max-md:size-7 max-md:px-0">
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
            {...menuProps}
            {...MENU_MOTION}
            aria-label={strings.header.new}
            style={{ transformOrigin: 'top left' }}
            className="floating absolute top-full left-0 z-50 mt-2 max-h-[min(36rem,calc(100dvh-5rem))] w-64 overflow-y-auto rounded-panel p-1.5 max-md:fixed max-md:top-14 max-md:left-3"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                openBlank(wide ? 'LR' : 'TB');
                close(true);
              }}
              className={`${MENU_ITEM} font-medium`}
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
                  className={`${MENU_ITEM} aria-checked:font-semibold aria-checked:text-accent`}
                >
                  <Icon size={16} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {strings.prompt.templateNames[id]}
                  </span>
                  {active && <Check size={15} aria-hidden="true" className="shrink-0" />}
                </button>
              );
            })}
            <div role="separator" className="mx-2 my-1.5 h-px bg-line" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close(true);
                dialogStore.getState().show('templates');
              }}
              className={MENU_ITEM}
            >
              <LayoutGrid size={16} aria-hidden="true" className="shrink-0" />
              {strings.gallery.open}
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
