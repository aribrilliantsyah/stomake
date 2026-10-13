import { expect, test } from 'vitest';
import { BRUSH, columnXs, COVER, FRAME, LABEL_Y, NOTE, PAGE, panelRect, panelSpace, SUB, TITLE } from '../src/shared/layout';

test('frame lebih besar: 198x352 (9:16), 3 kolom tetap muat dengan margin simetris', () => {
  expect(FRAME).toEqual({ w: 198, h: 352, y: 102 });
  expect(FRAME.h / FRAME.w).toBeCloseTo(16 / 9, 2);
  const xs = columnXs(3);
  expect(xs).toEqual([27.375, 255.375, 483.375]);
  expect(xs[0]).toBeCloseTo(PAGE.w - (xs[2] + FRAME.w), 5);
  expect(xs[1] - (xs[0] + FRAME.w)).toBe(30);
});

test('1-2 scene di tengah page', () => {
  expect(columnXs(1)).toEqual([255.375]);
  expect(columnXs(2)).toEqual([141.375, 369.375]);
  const [a, b] = columnXs(2);
  expect((a + b + FRAME.w) / 2).toBeCloseTo(PAGE.w / 2, 5);
});

test('urutan vertikal tidak bertumpuk dan muat di page', () => {
  expect(PAGE).toEqual({ w: 708.75, h: 567 });
  expect(TITLE.y + TITLE.size).toBeLessThan(LABEL_Y);
  expect(LABEL_Y + 12).toBeLessThanOrEqual(NOTE.y);
  expect(NOTE.y + NOTE.size * 1.2 * NOTE.maxLines).toBeLessThanOrEqual(FRAME.y);
  expect(FRAME.y + FRAME.h).toBeLessThan(SUB.y);
  expect(SUB.y + SUB.size * SUB.lineHeight * SUB.maxLines).toBeLessThanOrEqual(BRUSH.y);
  expect(BRUSH.y + 4).toBeLessThan(PAGE.h);
  expect(SUB.width).toBe(FRAME.w);
  expect(NOTE.width).toBe(FRAME.w);
});

test('cover: frame di tengah horizontal', () => {
  expect(COVER.x).toBeCloseTo((PAGE.w - FRAME.w) / 2, 5);
  expect(COVER.y + FRAME.h).toBeLessThan(PAGE.h);
});

test('panel rect (frame-local pt) & panel space', () => {
  expect(panelRect(false, 0)).toEqual({ x: 0, y: 0, w: 198, h: 352 });
  expect(panelRect(true, 1)).toEqual({ x: 0, y: 176, w: 198, h: 176 });
  expect(panelSpace(true)).toEqual({ w: 1080, h: 960 });
});
