import { Redo2, Undo2 } from 'lucide-react';
import { editorStore, useEditor } from '../editor/store.ts';
import { useStrings } from '../i18n/locale.ts';
import { Button } from './Button.tsx';

/** Undo and redo, also on Ctrl or ⌘ + Z and Ctrl or ⌘ + Shift + Z. */
export function HistoryControls() {
  const strings = useStrings();
  const canUndo = useEditor((state) => state.past.length > 0);
  const canRedo = useEditor((state) => state.future.length > 0);
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        className="max-md:size-7"
        aria-label={strings.header.undo}
        title={strings.header.undo}
        aria-keyshortcuts="Control+Z Meta+Z"
        disabled={!canUndo}
        onClick={() => editorStore.getState().undo()}
      >
        <Undo2 size={17} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="max-md:size-7"
        aria-label={strings.header.redo}
        title={strings.header.redo}
        aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
        disabled={!canRedo}
        onClick={() => editorStore.getState().redo()}
      >
        <Redo2 size={17} aria-hidden="true" />
      </Button>
    </div>
  );
}
