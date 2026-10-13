import { expect, test } from 'vitest';
import { defaultShape, lineHitBox, resizeShape } from '../src/shared/model';
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
  expect(new Set(ids).size).toBe(12);
});

test('resizeShape line (h=0) tetap 0, tidak NaN', () => {
  expect(resizeShape(defaultShape('line', full), 2, 3)).toEqual({ width: 1000, height: 0 });
});

test('resizeShape NaN → ukuran minimum (tidak NaN)', () => {
  const s = defaultShape('rect', full);
  expect(resizeShape(s, Number.NaN, Number.NaN)).toEqual({ width: 8, height: 8 });
  expect(resizeShape(s, 1.5, 0.5)).toEqual({ width: 600, height: 200 });
});

test('resizeShape: skala negatif (handle ditarik melewati sisi seberang) tidak jadi garis', () => {
  const s = defaultShape('rect', full);
  expect(resizeShape(s, -1.5, 1)).toEqual({ width: 600, height: 400 });
  expect(resizeShape(s, 1, -0.5)).toEqual({ width: 400, height: 200 });
});

test('resizeShape: shape non-garis minimal 8px; garis tetap tinggi 0', () => {
  expect(resizeShape(defaultShape('ellipse', full), 0.001, 0.001)).toEqual({ width: 8, height: 8 });
  expect(resizeShape(defaultShape('line', full), 3, 7)).toEqual({ width: 1500, height: 0 });
});

test('lineHitBox: garis punya kotak tinggi > 0 supaya Transformer bisa resize/rotate', () => {
  const l = defaultShape('line', full);
  const box = lineHitBox(l);
  expect(box.height).toBeGreaterThan(0);
  expect(box.width).toBe(500);
  expect(box.y).toBe(-box.height / 2);
});

test('panah putar (cw/ccw): kotak 400x400, tanpa isi, garis merah 14 supaya kontras di atas ilustrasi', async () => {
  const { rotatePath } = await import('../src/shared/rotateArrow');
  for (const k of ['rotateCw', 'rotateCcw'] as const) {
    expect(defaultShape(k, full)).toMatchObject({ shape: k, width: 400, height: 400, fill: null, stroke: '#E53935', strokeWidth: 14 });
  }
  // arc + head geometry: path stays inside the box, ccw is the mirror of cw
  const cw = rotatePath(400, 400, 14, 'cw');
  const ccw = rotatePath(400, 400, 14, 'ccw');
  const nums = (s: string) => s.match(/-?\d+(\.\d+)?/g)!.map(Number);
  for (const n of nums(cw.arc).concat(nums(cw.head))) expect(Math.abs(n)).toBeLessThanOrEqual(200);
  expect(nums(ccw.head)[0]).toBeCloseTo(-nums(cw.head)[0], 5);
  expect(cw.arc).not.toBe(ccw.arc);
});
