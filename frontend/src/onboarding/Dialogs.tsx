import { AnimatePresence } from 'motion/react';
import { AboutDialog } from './AboutDialog.tsx';
import { dialogStore, useDialog } from './dialog-store.ts';
import { ShortcutsDialog } from './ShortcutsDialog.tsx';
import { TemplateGallery } from './TemplateGallery.tsx';

/** The dialog that is open, if any, with its entrance and exit. */
export function Dialogs() {
  const open = useDialog((state) => state.open);
  const close = () => dialogStore.getState().close();
  return (
    <AnimatePresence>
      {open === 'templates' && <TemplateGallery key="templates" onClose={close} />}
      {open === 'shortcuts' && <ShortcutsDialog key="shortcuts" onClose={close} />}
      {open === 'about' && <AboutDialog key="about" onClose={close} />}
    </AnimatePresence>
  );
}
