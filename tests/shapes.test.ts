import { expect, test } from 'vitest';
import { defaultShape, resizeShape } from '../src/shared/model';
import { SHAPE_KINDS } from '../src/shared/types';

const full = { w: 1080, h: 1920 };

test('defaultShape rect: 400x400, tanpa isi, garis hitam 12, di tengah', () => {
  expect(defaultShape('rect', full)).toMatchObject({ type: 'shape', shape: 'rect', width: 400, height: 400, fill: null, stroke: '#000000', strokeWidth: 12, dash: false, x: 540, y: 960, rotation: 0, opacity: 1 });
});

test('defaultShape target merah, bubble isi putih, garis/panah 500x0', () => {
  expect(defaultShape('target', full)).toMatchObject({ fill: null, stroke: '#E53935' });
  expect(defaultShape('bubble', full)).toMatchObject({ fill: '#FFFFFF', stroke: '#000000' });
  for (const k of ['line', 'arrow', 'doubleArrow'] as const) expect(defaultShape(k, { w: 1080, h: 960 })).toMatchObject({ width: 500, height: 0, y: 480 });
});

test('semua jenis shape punya default dan id unik', () => {
  const ids = SHAPE_KINDS.map((k) => defaultShape(k, full).id);
  expect(new Set(ids).size).toBe(10);
});

test('resizeShape line (h=0) tetap 0, tidak NaN', () => {
  expect(resizeShape(defaultShape('line', full), 2, 3)).toEqual({ width: 1000, height: 0 });
});

test('resizeShape negatif/NaN → 0', () => {
  const s = defaultShape('rect', full);
  expect(resizeShape(s, -1, Number.NaN)).toEqual({ width: 0, height: 0 });
  expect(resizeShape(s, 1.5, 0.5)).toEqual({ width: 600, height: 200 });
});
