// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import type * as Desktop from '../src/web/desktop';
import type * as TauriCore from '@tauri-apps/api/core';
const native = vi.hoisted(() => {
  // The real bridge snapshots Tauri availability when its module loads.
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
  return { desktop: false, invoke: vi.fn() };
});
vi.mock('@tauri-apps/api/core', async (original) => ({ ...await original<typeof TauriCore>(), invoke: native.invoke }));
vi.mock('../src/web/desktop', async (original) => ({ ...await original<typeof Desktop>(), get isDesktop() { return native.desktop; } }));
import { ASSET_MIME, captureAssetDrop, draggedAsset, endAssetDrag, isAssetDrag, isFileDrag, startAssetDrag } from '../src/web/editor/assetDrag';
import { readLocalImages } from '../src/web/desktop';

beforeEach(() => { native.desktop = false; native.invoke.mockReset(); endAssetDrag(); });

function dt(types: Record<string, string> = {}, files = false): DataTransfer {
  const data = { ...types };
  return {
    files: [],
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

test('desktop URI drag accepts only local file images, with comments and blanks ignored', async () => {
  native.desktop = true;
  const transfer = dt({ 'text/uri-list': '# comment\r\n\r\nfile:///tmp/a%20b.png\r\nhttps://example.com/a.png\r\nfile://remote/tmp/a.png\r\nfile:///tmp/movie.mp4\r\nfile://localhost/tmp/b.JPG\r\n' });
  expect(isFileDrag(transfer)).toBe(true);
  const captured = captureAssetDrop(transfer);
  expect(captured).toEqual({ files: [], uris: ['file:///tmp/a%20b.png', 'file:///tmp/b.JPG'] });
  transfer.setData('text/uri-list', ''); // WebKit clears event data after dispatch
  native.invoke.mockResolvedValue([{ name: 'a b.png', mime: 'image/png', bytes: [137, 80, 78, 71] }]);
  const files = await readLocalImages(captured.uris);
  expect(native.invoke).toHaveBeenCalledWith('read_local_images', { uris: ['file:///tmp/a%20b.png', 'file:///tmp/b.JPG'] });
  expect(files[0]).toMatchObject({ name: 'a b.png', type: 'image/png', size: 4 });
});

test('browser URI drags never invoke native file reads', async () => {
  const transfer = dt({ 'text/uri-list': 'file:///tmp/a.png' });
  expect(isFileDrag(transfer)).toBe(false);
  expect(captureAssetDrop(transfer)).toEqual({ files: [], uris: [] });
  expect(native.invoke).not.toHaveBeenCalled();
});

test('actual files take precedence over URI fallback and internal tile payload is never an upload', () => {
  native.desktop = true;
  const transfer = dt({ 'text/uri-list': 'file:///tmp/a.png' }, true);
  const image = new File(['real file'], 'real.png', { type: 'image/png' });
  Object.defineProperty(transfer, 'files', { value: [image] });
  expect(captureAssetDrop(transfer)).toEqual({ files: [image], uris: [] });
  const tile = dt({ [ASSET_MIME]: JSON.stringify(a), 'text/uri-list': 'file:///tmp/a.png' }, true);
  expect(isFileDrag(tile)).toBe(false);
  expect(captureAssetDrop(tile)).toEqual({ files: [], uris: [] });
  startAssetDrag(a, dt());
  expect(isFileDrag(transfer)).toBe(false);
  expect(captureAssetDrop(transfer)).toEqual({ files: [], uris: [] });
});
