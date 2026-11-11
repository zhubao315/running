import { useCallback, useEffect, useState } from 'react';

/**
 * The light/dark theme of all four sites.
 *
 * The four sites are published from the same origin
 * (zhubao315.github.io/health, /running, /cycling, /hiking), so they share
 * one localStorage key: a theme picked on one site is the theme on the next
 * one. Dark is the default — it is the site's own look, and a visitor should
 * not get a different page because their system happens to prefer light.
 *
 * The first paint must not flash: index.html sets `data-theme` from the same
 * key before the stylesheet is applied, and this hook only keeps the document
 * in step afterwards.
 */

export type Theme = 'dark' | 'light';

/** Shared by all four sites — same origin, same preference. */
export const THEME_STORAGE_KEY = 'zhubao315-theme';

export const DEFAULT_THEME: Theme = 'dark';

const isTheme = (value: unknown): value is Theme =>
  value === 'dark' || value === 'light';

export const readStoredTheme = (): Theme => {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : DEFAULT_THEME;
  } catch (error) {
    // Storage can be blocked (private mode); the page still works.
    return DEFAULT_THEME;
  }
};

export const applyTheme = (theme: Theme): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
};

export const storeTheme = (theme: Theme): void => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // A blocked storage must not break the toggle: the theme still changes
    // for this page view, it just is not remembered.
  }
};

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  // Another tab of the same origin changed the theme: follow it.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (isTheme(event.newValue)) setTheme(event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleTheme = useCallback(
    () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')),
    []
  );

  return { theme, setTheme, toggleTheme };
};

export default useTheme;
