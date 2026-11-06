import { useEffect } from 'react';
import { dialogStore } from '../onboarding/dialog-store.ts';
import { reviewStore } from '../review/review-store.ts';
import { editorStore } from './store.ts';

/** Distance in diagram pixels that Alt and an arrow move the selection; with Shift, a fine step. */
const NUDGE_STEP = 10;
const FINE_NUDGE_STEP = 1;
const ARROWS: Readonly<Record<string, { x: number; y: number }>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

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
 * - Alt + an arrow: move the selected node, or the chosen ones, 10 px; with Shift, 1 px. Holding
 *   the key down is one step of the history.
 * - Enter or F2: edit the name of the selected node in its box, when the focus is on that node or
 *   on the page. A node that is not selected yet is just selected by Enter, as React Flow does.
 * - Escape: close the design review, or cancel a connection, or clear the selection.
 * - ?: show the keyboard shortcuts.
 *
 * None of them acts while a dialog is open over the editor.
 */
export function useEditorShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target)) return;
      if (dialogStore.getState().open !== null) return;
      const editor = editorStore.getState();
      const arrow = ARROWS[event.key];
      if (arrow && event.altKey && !event.ctrlKey && !event.metaKey) {
        if (editor.selection?.type !== 'node') return;
        // Also keeps Alt + Left from going back a page in the browser.
        event.preventDefault();
        const step = event.shiftKey ? FINE_NUDGE_STEP : NUDGE_STEP;
        editor.nudgeSelection({ x: arrow.x * step, y: arrow.y * step }, event.repeat);
        return;
      }
      if (event.altKey) return;
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
      } else if (!command && key === '?') {
        dialogStore.getState().show('shortcuts');
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
