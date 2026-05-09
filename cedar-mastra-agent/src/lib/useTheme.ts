'use client';

import * as React from 'react';

export type Theme = 'light' | 'dim' | 'dark';

export const THEMES: readonly Theme[] = ['light', 'dim', 'dark'] as const;

const STORAGE_KEY = 'theme';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dim' || value === 'dark';
}

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isTheme(stored)) return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function applyThemeClasses(theme: Theme) {
  if (typeof document === 'undefined') return;
  const cl = document.documentElement.classList;
  cl.toggle('dark', theme !== 'light');
  cl.toggle('theme-dim', theme === 'dim');
}

/**
 * Centralized theme state. Toggles `.dark` (for Tailwind's `dark:` variant)
 * and `.theme-dim` (for the softer middle theme) on `<html>` and persists
 * the selection to `localStorage`.
 */
export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>('dark');

  React.useEffect(() => {
    setThemeState(readInitialTheme());
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    applyThemeClasses(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}

/**
 * Apply the stored theme synchronously without subscribing to changes.
 * Use this on routes that only need to honor an existing selection
 * (e.g. `/login`, `/profile`) and don't render their own theme switcher.
 */
export function useApplyStoredTheme() {
  React.useEffect(() => {
    applyThemeClasses(readInitialTheme());
  }, []);
}
