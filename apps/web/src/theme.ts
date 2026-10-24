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

/** Length of the colour blend; matches the `.theme-fade` transition in styles.css. */
const THEME_FADE_MS = 420;
let fadeTimer: number | undefined;

/**
 * Applies a theme change with every colour of the page blending at once:
 * `.theme-fade` gives all elements a short colour transition while the theme
 * attribute changes. Skipped when the system asks for reduced motion.
 */
function blendThemeChange(apply: () => void): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }
  const root = document.documentElement;
  window.clearTimeout(fadeTimer);
  root.classList.add('theme-fade');
  apply();
  fadeTimer = window.setTimeout(() => root.classList.remove('theme-fade'), THEME_FADE_MS);
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
    // The page colours come from the attribute; React only has to update the toggle icon.
    blendThemeChange(() => {
      document.documentElement.dataset.theme = next;
    });
    setTheme(next);
  }, [theme]);

  return [theme, toggle];
}
