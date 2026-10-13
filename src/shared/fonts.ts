/** Fonts bundled with the app (offline, via @fontsource). Order = picker order. */
export const BUILTIN_FONTS = [
  'Coming Soon',
  'Bangers',
  'Inter',
  'Poppins',
  'Montserrat',
  'Bebas Neue',
  'Anton',
  'Permanent Marker',
  'Luckiest Guy',
  'Fredoka',
  'Patrick Hand',
  'Oswald',
  'Roboto Slab',
  'Caveat',
  'Lilita One',
] as const;

export function fontSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** CSS / canvas font-family value with fallback. */
export function fontStack(name: string): string {
  const q = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${q}", "Coming Soon", sans-serif`;
}
