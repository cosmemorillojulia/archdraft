import { CircleHelp, Info, Keyboard, LayoutGrid, type LucideIcon } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useStrings } from '../i18n/locale.ts';
import { type DialogId, dialogStore } from '../onboarding/dialog-store.ts';
import { Button } from './Button.tsx';
import { MENU_ITEM, MENU_MOTION, useMenu } from './menu.ts';

/** Header button with the ways in to the help: templates, shortcuts and what Archdraft is. */
export function HelpMenu() {
  const strings = useStrings();
  const { open, close, buttonProps, menuProps } = useMenu();
  const items: { dialog: DialogId; icon: LucideIcon; label: string; shortcut?: string }[] = [
    { dialog: 'templates', icon: LayoutGrid, label: strings.gallery.open },
    { dialog: 'shortcuts', icon: Keyboard, label: strings.shortcuts.open, shortcut: '?' },
    { dialog: 'about', icon: Info, label: strings.about.open },
  ];

  return (
    <div className="relative">
      <Button
        {...buttonProps}
        variant="ghost"
        size="icon"
        aria-label={strings.help.label}
        title={strings.help.label}
      >
        <CircleHelp size={17} aria-hidden="true" />
      </Button>
      <AnimatePresence>
        {open && (
          <m.div
            {...menuProps}
            {...MENU_MOTION}
            aria-label={strings.help.label}
            style={{ transformOrigin: 'top right' }}
            className="floating absolute top-full right-0 z-50 mt-2 w-60 rounded-panel p-1.5"
          >
            {items.map(({ dialog, icon: Icon, label, shortcut }) => (
              <button
                key={dialog}
                type="button"
                role="menuitem"
                onClick={() => {
                  // The focus goes back to the button, and the dialog gives it back there when it closes.
                  close(true);
                  dialogStore.getState().show(dialog);
                }}
                className={MENU_ITEM}
              >
                <Icon size={16} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 flex-1">{label}</span>
                {shortcut !== undefined && (
                  <kbd className="rounded border border-line px-1 font-sans text-xs text-muted">
                    {shortcut}
                  </kbd>
                )}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
