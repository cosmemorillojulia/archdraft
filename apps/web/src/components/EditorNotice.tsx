import { Spline, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect } from 'react';
import { editorStore, useEditor } from '../editor/store.ts';
import { EASE_OUT, SPRING_POP } from '../motion.ts';
import { strings } from '../strings.ts';
import { Button } from './Button.tsx';

/** How long a rejected edit stays explained before the notice leaves. */
const MESSAGE_MS = 4500;

const ENTER = {
  initial: { opacity: 0, y: -8, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, transition: { duration: 0.16, ease: EASE_OUT } },
  transition: SPRING_POP,
} as const;

/**
 * Notices over the canvas: why the last edit was not made, and the prompt
 * of a connection started from the inspector.
 */
export function EditorNotice() {
  const message = useEditor((state) => state.message);
  const connecting = useEditor((state) => state.connectingFrom !== null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => editorStore.getState().dismissMessage(), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div className="flex flex-col items-center gap-2">
      <AnimatePresence mode="popLayout">
        {connecting && (
          <m.div
            key="connecting"
            role="status"
            {...ENTER}
            className="floating pointer-events-auto flex items-center gap-2.5 rounded-full py-1 pr-1 pl-3.5 text-sm"
          >
            <Spline size={15} aria-hidden="true" className="shrink-0 text-accent" />
            {strings.canvas.connecting}
            <Button
              variant="ghost"
              onClick={() => editorStore.getState().cancelConnection()}
              className="h-8 rounded-full px-3"
            >
              {strings.canvas.cancelConnecting}
            </Button>
          </m.div>
        )}
        {message && (
          <m.div
            key={message.id}
            role="alert"
            {...ENTER}
            className="floating pointer-events-auto flex max-w-md items-start gap-2.5 rounded-panel py-2 pr-1.5 pl-3.5 text-sm"
          >
            <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
            <p className="min-w-0 flex-1 py-0.5">{message.text}</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label={strings.canvas.dismiss}
              title={strings.canvas.dismiss}
              onClick={() => editorStore.getState().dismissMessage()}
            >
              <X size={15} aria-hidden="true" />
            </Button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
