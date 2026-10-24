import { useCallback, useSyncExternalStore } from 'react';

/** Wide enough for the palette to sit beside the diagram (Tailwind's `md`). */
export const WIDE_SCREEN = '(min-width: 768px)';

/** Room for the minimap beside the prompt dock (Tailwind's `xl`). */
export const EXTRA_WIDE_SCREEN = '(min-width: 1280px)';

/** Whether a media query matches, kept in sync when the window changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
