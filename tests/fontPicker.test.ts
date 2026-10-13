import { expect, test } from 'vitest';
import { MENU_W, placeMenu } from '../src/web/editor/FontPicker';

const trig = (left: number, top: number, w = 120, h = 26) => ({ left, right: left + w, top, bottom: top + h });

test('menu di bawah tombol, tidak keluar viewport kanan (panel kanan sempit)', () => {
  const p = placeMenu(trig(1180, 300), 1280, 800);
  expect(p.left + MENU_W).toBeLessThanOrEqual(1280 - 8);
  expect(p.left).toBeGreaterThanOrEqual(8);
  expect(p.top).toBe(328);
});

test('tidak keluar viewport kiri', () => {
  expect(placeMenu(trig(-50, 100), 1280, 800).left).toBe(8);
});

test('flip ke atas bila ruang bawah sempit', () => {
  const p = placeMenu(trig(900, 700), 1280, 800);
  expect(p.top + p.maxHeight).toBeLessThanOrEqual(700);
  expect(p.top).toBeGreaterThanOrEqual(0);
});

test('tombol sebagian di luar layar → menu tetap utuh di dalam viewport', () => {
  const p = placeMenu(trig(1000, 725), 1280, 633);
  expect(p.top).toBeGreaterThanOrEqual(8);
  expect(p.top + p.maxHeight).toBeLessThanOrEqual(633 - 8);
});
