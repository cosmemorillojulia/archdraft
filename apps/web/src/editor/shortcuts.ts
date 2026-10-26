import { useEffect } from 'react';
import { reviewStore } from '../review/review-store.ts';
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
 * - Enter or F2: edit the name of the selected node in its box, when the focus is on that node or
 *   on the page. A node that is not selected yet is just selected by Enter, as React Flow does.
 * - Escape: close the design review, or cancel a connection, or clear the selection.
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
        const review = reviewStore.getState();
        if (review.open) {
          review.setOpen(false);
        } else {
          handled = editor.selection !== null || editor.connectingFrom !== null;
          editor.select(null);
        }
      } else {
        handled = false;
      }
      if (handled) event.preventDefault();
    };
    // Before React Flow sees the key, so that Enter on a node that is not selected yet only selects it.
    const onRenameKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key !== 'enter' && key !== 'f2') return;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTyping(event.target)) return;
      const { selection } = editorStore.getState();
      if (selection?.type !== 'node') return;
      const focused =
        event.target instanceof HTMLElement ? event.target.closest('.react-flow__node') : null;
      if (event.target !== document.body && focused?.getAttribute('data-id') !== selection.id)
        return;
      event.preventDefault();
      editorStore.getState().startRename(selection.id);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onRenameKey, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onRenameKey, true);
    };
  }, [enabled]);
}
