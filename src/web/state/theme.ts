import { create } from 'zustand';

export type ThemePref = 'light' | 'dark' | 'system';
export const THEME_KEY = 'sb.theme';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref, prefersDark: boolean): 'light' | 'dark' {
  return pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref;
}

const media = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null);
let unlisten: (() => void) | null = null;

/** Applies the theme to <html data-theme>, stores it, and follows the OS while pref is 'system'. */
export function applyTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore */
  }
  const m = media();
  const set = () => (document.documentElement.dataset.theme = resolveTheme(pref, !!m?.matches));
  set();
  unlisten?.();
  unlisten = null;
  if (pref === 'system' && m) {
    m.addEventListener('change', set);
    unlisten = () => m.removeEventListener('change', set);
  }
}

interface ThemeState {
  pref: ThemePref;
  setPref(p: ThemePref): void;
}

export const useTheme = create<ThemeState>((set) => ({
  pref: typeof localStorage === 'undefined' ? 'system' : readThemePref(),
  setPref(pref) {
    applyTheme(pref);
    set({ pref });
  },
}));

/** Effective theme right now (for the toggle icon). */
export function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
