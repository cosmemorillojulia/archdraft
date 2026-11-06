import { AnimatePresence } from 'motion/react';
import { dialogStore, useDialog } from './dialog-store.ts';
import { TemplateGallery } from './TemplateGallery.tsx';

/** The dialog that is open, if any, with its entrance and exit. */
export function Dialogs() {
  const open = useDialog((state) => state.open);
  const close = () => dialogStore.getState().close();
  return (
    <AnimatePresence>
      {open === 'templates' && <TemplateGallery key="templates" onClose={close} />}
    </AnimatePresence>
  );
}
