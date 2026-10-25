import { documentToJson } from '@archdraft/core';
import { editorStore } from '../editor/store.ts';
import { strings } from '../strings.ts';

/**
 * Where the open diagram is kept between visits. The version in the key is
 * the version of this storage entry; the diagram format carries its own
 * `schemaVersion`, which importDocument migrates.
 */
export const SAVED_DOCUMENT_KEY = 'archdraft:document:v1';

/** Pause after the last edit before saving, so that a burst of edits is one write. */
const SAVE_DELAY_MS = 400;

/** The diagram saved in this browser, or null if there is none or storage is blocked. */
export function readSavedDocument(): string | null {
  try {
    return localStorage.getItem(SAVED_DOCUMENT_KEY);
  } catch (error) {
    console.warn('Could not read the saved diagram', error);
    return null;
  }
}

/**
 * Saves the open diagram in localStorage shortly after every change, and at
 * once when the page is hidden or closed. If storage fails (blocked, full),
 * the editor says so once and keeps working. Returns a function that stops
 * saving, after saving what is pending.
 */
export function startAutosave(store = editorStore): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;

  const save = () => {
    timer = undefined;
    const document = store.getState().current?.document;
    if (!document) return;
    try {
      localStorage.setItem(SAVED_DOCUMENT_KEY, documentToJson(document, { indent: 0 }));
    } catch (error) {
      console.warn('Could not save the diagram', error);
      if (!warned) {
        warned = true;
        store.getState().notify(strings.persist.saveFailed);
      }
    }
  };
  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    save();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  const unsubscribe = store.subscribe((state, previous) => {
    const current = state.current?.document;
    if (!current || current === previous.current?.document) return;
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    unsubscribe();
    flush();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
