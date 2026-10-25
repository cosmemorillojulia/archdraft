import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

/** Where the choice to show the particles that travel along connections is kept. */
export const FLOW_ANIMATION_KEY = 'archdraft:flow-animation';

function loadFlowAnimation(): boolean {
  try {
    return localStorage.getItem(FLOW_ANIMATION_KEY) !== 'off';
  } catch (error) {
    console.warn('Could not read the flow animation preference', error);
    return true;
  }
}

export interface Preferences {
  /** Particles travel along the connections; on unless turned off. */
  readonly flowAnimation: boolean;
  setFlowAnimation: (on: boolean) => void;
}

/** View preferences of this browser. They are not part of the diagram. */
export function createPreferencesStore(flowAnimation = true) {
  return createStore<Preferences>()((set) => ({
    flowAnimation,
    setFlowAnimation: (on) => {
      try {
        localStorage.setItem(FLOW_ANIMATION_KEY, on ? 'on' : 'off');
      } catch (error) {
        // Storage can be blocked; the choice still applies for this visit.
        console.warn('Could not save the flow animation preference', error);
      }
      set({ flowAnimation: on });
    },
  }));
}

export const preferencesStore = createPreferencesStore(loadFlowAnimation());

export function usePreferences<T>(selector: (state: Preferences) => T): T {
  return useStore(preferencesStore, selector);
}
