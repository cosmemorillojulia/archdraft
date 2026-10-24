import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';

/** Where a theme change starts, for the circular reveal. */
export interface RevealOrigin {
  x: number;
  y: number;
}

/** Also read by the inline script in index.html that sets the theme before the first paint. */
const STORAGE_KEY = 'archdraft:theme';

function initialTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  if (applied === 'light' || applied === 'dark') return applied;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    // Storage can be blocked (private mode, site settings); the theme still applies for this visit.
    console.warn('Could not save the theme preference', error);
  }
}

function canAnimateThemeChange(): boolean {
  return (
    'startViewTransition' in document &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Current theme, initialised from the saved choice or the system setting, and
 * a toggle that saves the choice. Given an origin, the new theme spreads from
 * that point as a circle (View Transitions API) where the browser supports it.
 */
export function useTheme(): [Theme, (origin?: RevealOrigin) => void] {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(
    (origin?: RevealOrigin) => {
      const next = theme === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      const apply = () => {
        document.documentElement.dataset.theme = next;
        flushSync(() => setTheme(next));
      };
      if (origin === undefined || !canAnimateThemeChange()) {
        apply();
        return;
      }
      const root = document.documentElement.style;
      const radius = Math.hypot(
        Math.max(origin.x, window.innerWidth - origin.x),
        Math.max(origin.y, window.innerHeight - origin.y),
      );
      root.setProperty('--reveal-x', `${origin.x}px`);
      root.setProperty('--reveal-y', `${origin.y}px`);
      root.setProperty('--reveal-radius', `${radius}px`);
      document.startViewTransition(apply);
    },
    [theme],
  );

  return [theme, toggle];
}
