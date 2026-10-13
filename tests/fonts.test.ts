import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { BUILTIN_FONTS, fontSlug, fontStack } from '../src/shared/fonts';

test('BUILTIN_FONTS berisi 15 nama sesuai SPEC-V2 W9', () => {
  expect(BUILTIN_FONTS).toEqual([
    'Coming Soon', 'Bangers', 'Inter', 'Poppins', 'Montserrat', 'Bebas Neue', 'Anton', 'Permanent Marker',
    'Luckiest Guy', 'Fredoka', 'Patrick Hand', 'Oswald', 'Roboto Slab', 'Caveat', 'Lilita One',
  ]);
});

test('fontStack quote & escape', () => {
  expect(fontStack('Bangers')).toBe('"Bangers", "Coming Soon", sans-serif');
  expect(fontStack('My "Font"')).toBe('"My \\"Font\\"", "Coming Soon", sans-serif');
});

test('setiap BUILTIN_FONTS punya paket @fontsource terpasang', () => {
  for (const f of BUILTIN_FONTS) {
    expect(fontSlug(f)).toMatch(/^[a-z-]+$/);
    expect(existsSync(join(__dirname, '..', 'node_modules', '@fontsource', fontSlug(f), '400.css')), f).toBe(true);
  }
});
