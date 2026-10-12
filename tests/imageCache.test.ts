// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { assetUrl, loadImage, clearImageCache } from '../src/web/state/imageCache';

let created = 0;
beforeEach(() => {
  created = 0;
  clearImageCache();
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = '';
    private _src = '';
    constructor() { created++; }
    set src(v: string) {
      this._src = v;
      queueMicrotask(() => (v.includes('missing') ? this.onerror?.() : this.onload?.()));
    }
    get src() { return this._src; }
  }
  vi.stubGlobal('Image', FakeImage);
});

test('assetUrl', () => {
  expect(assetUrl('global:dont .png', 'x')).toBe('/files/global/dont%20.png');
  expect(assetUrl('project:todoroki (2).png', 'selimut-darurat')).toBe('/files/project/selimut-darurat/todoroki%20(2).png');
});

test('url yang sama hanya dimuat sekali', async () => {
  const all = await Promise.all(Array.from({ length: 25 }, () => loadImage('/files/global/a.png')));
  expect(created).toBe(1);
  expect(new Set(all).size).toBe(1);
  expect(all[0]).not.toBeNull();
});

test('error load → null (missing)', async () => {
  expect(await loadImage('/files/global/missing.png')).toBeNull();
});
