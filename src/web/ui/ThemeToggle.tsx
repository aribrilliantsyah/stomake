import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../state/theme';

/** One-click light/dark switch (Settings also offers "follow system"). */
export function ThemeToggle() {
  const pref = useTheme((t) => t.pref);
  const setPref = useTheme((t) => t.setPref);
  const dark = pref === 'dark' || (pref === 'system' && document.documentElement.dataset.theme === 'dark');
  return (
    <button className="ib ghost theme-toggle" onClick={() => setPref(dark ? 'light' : 'dark')} title={dark ? 'Mode terang' : 'Mode gelap'} aria-label={dark ? 'Mode terang' : 'Mode gelap'}>
      {dark ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
    </button>
  );
}
