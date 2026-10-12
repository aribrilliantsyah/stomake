import { expect, test } from 'vitest';
import { fitText, SUB } from '../src/shared/layout';

const measure = (s: string, size: number) => s.length * size * 0.5;
const opts = { width: SUB.width, maxLines: SUB.maxLines, size: SUB.size, minSize: SUB.minSize, measure };

test('teks pendek tetap 11pt, 1 baris', () => {
  expect(fitText('kenapa orang yang hipotermia', opts)).toEqual({ size: 11, lines: ['kenapa orang yang hipotermia'] });
});

test('wrap ke beberapa baris di 11pt bila muat 4 baris', () => {
  const r = fitText('Tapi tikus yang dipake juga bukan sembarangan tikus dan bukan tikus got', opts);
  expect(r.size).toBe(11);
  expect(r.lines.length).toBe(3);
  for (const l of r.lines) expect(measure(l, r.size)).toBeLessThanOrEqual(200);
});

test('teks panjang mengecil tapi tidak < 8pt', () => {
  const text = 'Tubuh manusia itu terus-terusan ngeluarin panas dalam bentuk radiasi inframerah, bahkan pas lagi diem kalau panas ini terus lepas ke lingkungan';
  const r = fitText(text, opts);
  expect(r.size).toBeLessThan(11);
  expect(r.size).toBeGreaterThanOrEqual(8);
  expect(r.lines.length).toBeLessThanOrEqual(4);
  expect(r.lines.join(' ')).toBe(text);
});

test('teks sangat panjang → maxLines baris, baris terakhir diakhiri "…"', () => {
  const r = fitText('kata '.repeat(200), opts);
  expect(r.size).toBe(8);
  expect(r.lines).toHaveLength(4);
  expect(r.lines[3].endsWith('…')).toBe(true);
  for (const l of r.lines) expect(measure(l, 8)).toBeLessThanOrEqual(200);
});

test('string kosong → lines [] size 11', () => {
  expect(fitText('', opts)).toEqual({ size: 11, lines: [] });
  expect(fitText('   ', opts)).toEqual({ size: 11, lines: [] });
});

test('kata tunggal lebih panjang dari lebar tetap ditampilkan (terpotong …)', () => {
  const r = fitText('x'.repeat(500), opts);
  expect(r.lines).toHaveLength(4);
  expect(r.lines[3].endsWith('…')).toBe(true);
  for (const l of r.lines) expect(measure(l, r.size)).toBeLessThanOrEqual(200);
});
