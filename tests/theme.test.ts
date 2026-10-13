// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { applyTheme, readThemePref, resolveTheme } from '../src/web/state/theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

test('resolveTheme', () => {
  expect(resolveTheme('system', true)).toBe('dark');
  expect(resolveTheme('system', false)).toBe('light');
  expect(resolveTheme('light', true)).toBe('light');
  expect(resolveTheme('dark', false)).toBe('dark');
});

test('readThemePref: kosong / asing → system', () => {
  expect(readThemePref()).toBe('system');
  localStorage.setItem('sb.theme', 'ungu');
  expect(readThemePref()).toBe('system');
  localStorage.setItem('sb.theme', 'dark');
  expect(readThemePref()).toBe('dark');
});

test('applyTheme menulis data-theme dan localStorage', () => {
  applyTheme('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('sb.theme')).toBe('dark');
  applyTheme('light');
  expect(document.documentElement.dataset.theme).toBe('light');
});

// ---- CSS checks ----
const css = readFileSync(join(__dirname, '../src/web/styles.css'), 'utf8');

function block(selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`no block ${selector}`);
  return css.slice(i, css.indexOf('}', i) + 1);
}

function vars(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block(selector).matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function lum(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const REQUIRED = ['--bg', '--panel', '--panel-2', '--line', '--line-strong', '--text', '--muted', '--accent', '--accent-soft', '--danger', '--danger-soft', '--hover', '--shadow'];

test('kedua palet punya semua variabel; palet gelap sesuai spec', () => {
  const light = vars(':root');
  const dark = vars(':root[data-theme="dark"]');
  for (const v of REQUIRED) {
    expect(light[v], `light ${v}`).toBeTruthy();
    expect(dark[v], `dark ${v}`).toBeTruthy();
  }
  // warm neutral + clay accent (revisi 5, SPEC-V3 §8 R5)
  expect(dark).toMatchObject({ '--bg': '#1a1918', '--panel': '#232220', '--panel-2': '#2a2926', '--line': '#383632', '--line-strong': '#4a4843', '--text': '#ece9e2', '--muted': '#a19d94', '--accent': '#d97757', '--accent-soft': '#30231d', '--danger': '#ef6a5a' });
});

test('kontras teks ≥ 4.5 di kedua tema', () => {
  for (const sel of [':root', ':root[data-theme="dark"]']) {
    const v = vars(sel);
    expect(contrast(v['--accent'], v['--panel']), `${sel} accent`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--accent'], v['--accent-soft']), `${sel} accent on soft`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--text'], v['--panel']), `${sel} text`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v['--muted'], v['--panel']), `${sel} muted`).toBeGreaterThanOrEqual(4.5);
  }
});

test('tidak ada warna UI hardcoded di luar blok palet (kecuali baris /* content */)', () => {
  const rest = css.replace(block(':root'), '').replace(block(':root[data-theme="dark"]'), '');
  const bad = rest
    .split('\n')
    .filter((l) => !l.includes('/* content */'))
    .filter((l) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(l));
  expect(bad).toEqual([]);
});
