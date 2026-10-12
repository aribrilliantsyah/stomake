import { expect, test } from 'vitest';
import { columnXs, FRAME, PAGE, panelRect, panelSpace } from '../src/shared/layout';

test('posisi kolom', () => {
  expect(columnXs(3)).toEqual([35, 263, 491]);
  // 1-2 scenes: frames centered on the page (frame center = page center)
  expect(columnXs(1)).toEqual([282.375]);
  expect(columnXs(2)).toEqual([168.375, 396.375]);
  const [a, b] = columnXs(2);
  expect((a + b + 144) / 2).toBeCloseTo(708.75 / 2, 5);
});

test('frame 9:16 dan page', () => {
  expect(FRAME.h / FRAME.w).toBeCloseTo(16 / 9, 2);
  expect(PAGE).toEqual({ w: 708.75, h: 567 });
});

test('panel rect (frame-local pt) & panel space', () => {
  expect(panelRect(false, 0)).toEqual({ x: 0, y: 0, w: 144, h: 256 });
  expect(panelRect(true, 0)).toEqual({ x: 0, y: 0, w: 144, h: 128 });
  expect(panelRect(true, 1)).toEqual({ x: 0, y: 128, w: 144, h: 128 });
  expect(panelSpace(true)).toEqual({ w: 1080, h: 960 });
  expect(panelSpace(false)).toEqual({ w: 1080, h: 1920 });
});
