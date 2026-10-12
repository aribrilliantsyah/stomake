/** Fonts drawn on canvas (Konva) are not loaded by CSS usage alone; load them explicitly. */
export const CANVAS_FONTS = ['Coming Soon', 'Bangers', 'Inter'] as const;

let ready: Promise<void> | null = null;
export function loadFonts(): Promise<void> {
  ready ??= Promise.all(CANVAS_FONTS.map((f) => document.fonts.load(`40px "${f}"`)))
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch(() => undefined);
  return ready;
}

export function loadedFonts(): string[] {
  return CANVAS_FONTS.filter((f) => document.fonts.check(`40px "${f}"`));
}
