import '@fontsource/coming-soon/400.css';
import '@fontsource/bangers/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/poppins/400.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/anton/400.css';
import '@fontsource/permanent-marker/400.css';
import '@fontsource/luckiest-guy/400.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/patrick-hand/400.css';
import '@fontsource/oswald/400.css';
import '@fontsource/roboto-slab/400.css';
import '@fontsource/caveat/400.css';
import '@fontsource/lilita-one/400.css';
import { BUILTIN_FONTS, fontStack } from '../shared/fonts';

/** Fonts drawn on canvas (Konva) are not loaded by CSS usage alone; load them explicitly. */
export const CANVAS_FONTS = BUILTIN_FONTS;

let ready: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  ready ??= Promise.all(BUILTIN_FONTS.map((f) => document.fonts.load(`40px ${fontStack(f)}`)))
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch(() => undefined);
  return ready;
}

/** Load one font (bundled or installed on this computer). Resolves true when it is usable. */
export async function loadFont(name: string): Promise<boolean> {
  try {
    await document.fonts.load(`40px ${fontStack(name)}`);
  } catch {
    /* ignore */
  }
  return isFontAvailable(name);
}

/**
 * True when `name` renders as itself, not a fallback. `document.fonts.check` returns true for unknown
 * families, so compare canvas metrics against two different fallbacks instead.
 */
export function isFontAvailable(name: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return true;
  const sample = 'mmmmmmmmmmlli WQ@#';
  const q = fontStack(name).split(',')[0];
  const widths = ['monospace', 'serif'].map((fb) => {
    ctx.font = `40px ${fb}`;
    const base = ctx.measureText(sample).width;
    ctx.font = `40px ${q}, ${fb}`;
    return ctx.measureText(sample).width !== base;
  });
  return widths[0] || widths[1];
}

export function loadedFonts(): string[] {
  return BUILTIN_FONTS.filter((f) => isFontAvailable(f));
}

interface LocalFontData {
  family: string;
}
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

export const localFontsSupported = () => typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';

/** Families installed on this computer (Chrome Local Font Access). [] when unsupported or denied. */
export async function listLocalFonts(): Promise<string[]> {
  if (!localFontsSupported()) return [];
  try {
    const fonts = await window.queryLocalFonts!();
    return [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}
