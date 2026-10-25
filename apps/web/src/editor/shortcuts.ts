import { useEffect } from 'react';
import { editorStore } from './store.ts';

/** Whether a key press belongs to a text field rather than to the editor. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Keyboard shortcuts of the editor, on the whole page, except while typing:
 *
 * - Delete or Backspace: delete the selection.
 * - Ctrl or ⌘ + Z: undo; with Shift, or Ctrl + Y: redo.
 * - Ctrl or ⌘ + D: duplicate the selected node.
 * - Escape: cancel a connection, or clear the selection.
 */
export function useEditorShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || isTyping(event.target)) return;
      const editor = editorStore.getState();
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      let handled = true;
      if (command && key === 'z') {
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (command && key === 'y') {
        editor.redo();
      } else if (command && key === 'd') {
        editor.duplicateSelection();
      } else if (!command && (key === 'delete' || key === 'backspace')) {
        handled = editor.selection !== null;
        editor.removeSelection();
      } else if (!command && key === 'escape') {
        handled = editor.selection !== null || editor.connectingFrom !== null;
        editor.select(null);
      } else {
        handled = false;
      }
      if (handled) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
