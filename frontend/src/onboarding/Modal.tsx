import { X } from 'lucide-react';
import { m } from 'motion/react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Button } from '../components/Button.tsx';
import { useStrings } from '../i18n/locale.ts';
import { EASE_OUT } from '../motion.ts';

interface ModalProps {
  title: string;
  /** One line under the title. */
  subtitle?: string;
  onClose: () => void;
  /** `wide` for the gallery of templates; `narrow` for text to read. */
  width?: 'narrow' | 'wide';
  children: ReactNode;
}

/**
 * A dialog over the editor, centred, with a dimmed backdrop. It takes the focus when it opens
 * and gives it back to where it was when it closes; Escape, its button and a click on the
 * backdrop close it. The editor behind is made inert by `App` while it is open, so the focus
 * and screen readers stay in it. The parent AnimatePresence plays its exit.
 */
export function Modal({ title, subtitle, onClose, width = 'narrow', children }: ModalProps) {
  const strings = useStrings();
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const before = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <m.div
        aria-hidden="true"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
      />
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(subtitle === undefined ? {} : { 'aria-describedby': subtitleId })}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          // Handled here, so the editor does not also clear its selection.
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15, ease: EASE_OUT } }}
        transition={{ duration: 0.22, ease: EASE_OUT }}
        className={`floating relative flex max-h-[85dvh] w-full flex-col rounded-panel outline-none ${
          width === 'wide' ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        <div className="flex items-start gap-3 border-b border-line py-3 pr-3 pl-5">
          <div className="min-w-0 flex-1 py-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {subtitle !== undefined && (
              <p id={subtitleId} className="mt-0.5 text-sm text-muted">
                {subtitle}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={strings.dialogs.close}
            title={strings.dialogs.close}
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </m.div>
    </div>
  );
}
