import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { EASE_OUT } from '../motion.ts';

const ITEMS = '[role^="menuitem"]';

/**
 * State and behaviour of a button that opens a menu: a press outside closes
 * it, opening focuses the checked item (or the first), the arrows, Home and
 * End move between items and Escape closes it and returns the focus.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

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

  useEffect(() => {
    if (!open) return;
    const checked = menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? menuRef.current?.querySelector<HTMLElement>(ITEMS))?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      // Handled here, so the editor does not also clear its selection.
      event.preventDefault();
      close(true);
      return;
    }
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
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

  const buttonProps = {
    ref: buttonRef,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => setOpen((current) => !current),
  } as const;

  const menuProps = { ref: menuRef, id: menuId, role: 'menu', onKeyDown } as const;

  return { open, close, buttonRef, buttonProps, menuProps };
}

/** Entry and exit of a menu that drops from its button. */
export const MENU_MOTION = {
  initial: { opacity: 0, y: -6, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.14, ease: EASE_OUT } },
  transition: { duration: 0.2, ease: EASE_OUT },
} as const;

/** Classes of an item of a menu. */
export const MENU_ITEM =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 outline-none hover:bg-ink/6 focus-visible:bg-ink/6';
