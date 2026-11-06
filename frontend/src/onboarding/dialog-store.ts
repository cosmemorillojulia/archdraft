import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** The dialogs over the editor; one at a time. */
export type DialogId = 'templates' | 'shortcuts' | 'about';

export interface DialogState {
  readonly open: DialogId | null;
  show: (dialog: DialogId) => void;
  close: () => void;
}

export const dialogStore = createStore<DialogState>()((set) => ({
  open: null,
  show: (dialog) => set({ open: dialog }),
  close: () => set({ open: null }),
}));

export function useDialog<T>(select: (state: DialogState) => T): T {
  return useStore(dialogStore, select);
}
