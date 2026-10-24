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

/** Current theme, initialised from the saved choice or the system setting, and a toggle that saves the choice. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    saveTheme(next);
    setTheme(next);
  }, [theme]);

  return [theme, toggle];
}
