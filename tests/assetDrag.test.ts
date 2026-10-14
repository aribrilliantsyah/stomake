// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { ASSET_MIME, draggedAsset, endAssetDrag, isAssetDrag, isFileDrag, startAssetDrag } from '../src/web/editor/assetDrag';

function dt(types: Record<string, string> = {}, files = false): DataTransfer {
  const data = { ...types };
  return {
    get types() {
      return [...Object.keys(data), ...(files ? ['Files'] : [])];
    },
    getData: (k: string) => data[k] ?? '',
    setData: (k: string, v: string) => {
      data[k] = v;
    },
    effectAllowed: 'none',
  } as unknown as DataTransfer;
}
const a = { ref: 'project:kipas.png' as const, name: 'kipas.png', width: 10, height: 20, url: '/x' };

test('tile drag: dikenali walau custom MIME hilang dari DataTransfer di drop target', () => {
  startAssetDrag(a, dt());
  const stripped = dt(); // browser lost our type
  expect(isAssetDrag(stripped)).toBe(true);
  expect(draggedAsset(stripped)).toEqual(a);
  expect(isFileDrag(dt({}, true))).toBe(false); // our drag is never treated as an upload
  endAssetDrag();
  expect(isAssetDrag(stripped)).toBe(false);
});

test('fallback ke payload DataTransfer; file OS = upload', () => {
  endAssetDrag();
  const d = dt({ [ASSET_MIME]: JSON.stringify(a) });
  expect(isAssetDrag(d)).toBe(true);
  expect(draggedAsset(d)).toEqual(a);
  expect(draggedAsset(dt({ [ASSET_MIME]: '{bad' }))).toBeNull();
  expect(isFileDrag(dt({}, true))).toBe(true);
});

test('dragend di window membersihkan state', () => {
  startAssetDrag(a, dt());
  window.dispatchEvent(new Event('dragend'));
  expect(isAssetDrag(dt())).toBe(false);
});

test('drop di window: state masih ada untuk handler drop target, lalu dibersihkan', async () => {
  startAssetDrag(a, dt());
  let seen: unknown = 'unset';
  const target = document.createElement('div');
  document.body.appendChild(target);
  target.addEventListener('drop', () => {
    seen = draggedAsset(dt());
  });
  target.dispatchEvent(new Event('drop', { bubbles: true }));
  expect(seen).toEqual(a);
  await new Promise((r) => setTimeout(r, 5));
  expect(isAssetDrag(dt())).toBe(false);
});
