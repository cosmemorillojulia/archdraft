import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

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

/** Missing in browsers without view transitions, although the DOM types always declare it. */
function supportsViewTransitions(): boolean {
  return typeof (document as Partial<Document>).startViewTransition === 'function';
}

/** Length of the fallback colour blend; matches the `.theme-fade` transition in styles.css. */
const THEME_FADE_MS = 450;
/** Extra time before the fallback blend ends, so late transitions finish instead of jumping. */
const THEME_FADE_SLACK_MS = 150;
let fadeTimer: number | undefined;

/**
 * Applies a theme change as a cross-fade (ADR 0018). Where the browser has
 * view transitions, it fades a snapshot of the page in the old theme into the
 * live page in the new one, on the compositor: a single style change, so the
 * fade stays smooth however large the diagram. Elsewhere `.theme-fade` gives
 * every element a short colour transition while the theme changes. Skipped
 * when the system asks for reduced motion.
 */
function blendThemeChange(apply: () => void): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }
  if (supportsViewTransitions()) {
    document.startViewTransition(apply);
    return;
  }
  const root = document.documentElement;
  window.clearTimeout(fadeTimer);
  root.classList.add('theme-fade');
  apply();
  fadeTimer = window.setTimeout(
    () => root.classList.remove('theme-fade'),
    THEME_FADE_MS + THEME_FADE_SLACK_MS,
  );
}

/** Current theme, initialised from the saved choice or the system setting, and a toggle that saves the choice. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    saveTheme(next);
    // The page colours come from the attribute; React only has to update the toggle icon,
    // after the snapshot of the old theme has been taken.
    blendThemeChange(() => {
      document.documentElement.dataset.theme = next;
      setTheme(next);
    });
  }, [theme]);

  return [theme, toggle];
}
