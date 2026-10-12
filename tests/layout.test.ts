import { expect, test } from 'vitest';
import { columnXs, FRAME, PAGE, panelRect, panelSpace } from '../src/shared/layout';

test('posisi kolom', () => {
  expect(columnXs(3)).toEqual([35, 263, 491]);
  expect(columnXs(2)).toEqual([149, 377]);
  expect(columnXs(1)).toEqual([263]);
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
