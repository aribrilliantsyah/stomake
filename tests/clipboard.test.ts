// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { addLayer, createProject, defaultEmoji, pasteFileName, pasteLayer, withPageSizes } from '../src/shared/model';
import type * as Desktop from '../src/web/desktop';
import { useUi } from '../src/web/state/uiStore';
import { installClipboard } from '../src/web/editor/clipboard';

const uploadAssets = vi.fn();
const native = vi.hoisted(() => ({ desktop: false, readText: vi.fn(), readImage: vi.fn(), readLocalImages: vi.fn() }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ readText: native.readText, readImage: native.readImage }));
vi.mock('../src/web/desktop', async (original) => ({
  ...await original<typeof Desktop>(),
  get isDesktop() { return native.desktop; },
  readLocalImages: native.readLocalImages,
}));
const uploadClips = vi.fn();
vi.mock('../src/web/api', () => ({
  api: {
    getProject: vi.fn(),
    saveProject: vi.fn().mockResolvedValue({ updatedAt: 'x' }),
    uploadAssets: (...a: unknown[]) => uploadAssets(...a),
    uploadClips: (...a: unknown[]) => uploadClips(...a),
  },
}));

const { useEditor } = await import('../src/web/state/editorStore');
const { handleCopy, handleCut, handlePaste } = await import('../src/web/editor/clipboard');

const space = { w: 1080, h: 1920 };

function setup() {
  let p = withPageSizes(createProject('A', 'now'), [2]);
  const [a, b] = p.pages[0].scenes.map((s) => s.panels[0].id);
  const layer = { ...defaultEmoji('🔥', space), id: 'L1', x: 100, y: 200 };
  p = addLayer(p, a, layer);
  useEditor.setState({ project: p, slug: 'a', currentSceneId: p.pages[0].scenes[0].id, selectedCover: false, activePanelId: a, selectedLayerId: 'L1', selectedLayerIds: ['L1'], past: [], future: [], clipboard: null });
  return { a, b };
}
const layersOf = (panelIndex: number) => useEditor.getState().project!.pages[0].scenes[panelIndex].panels[0].layers;

/** a fake system clipboard shared by copy → paste events (like the real one) */
let sys: Record<string, string> = {};
function clipEvent(type: string, target: EventTarget = document.body, files: File[] = []) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(e, 'target', { value: target });
  const data = {
    files,
    get types() {
      return [...Object.keys(sys), ...(files.length ? ['Files'] : [])];
    },
    setData: (k: string, v: string) => {
      if (type !== 'paste') sys[k] = v;
    },
    getData: (k: string) => sys[k] ?? '',
  };
  Object.defineProperty(e, 'clipboardData', { value: data });
  return e;
}

beforeEach(() => {
  sys = {};
  native.desktop = false;
  native.readText.mockReset();
  native.readImage.mockReset();
  native.readLocalImages.mockReset();
  uploadAssets.mockReset();
  uploadClips.mockReset();
  useEditor.setState({ copiedAsset: null });
  useUi.setState({ toasts: [] });
});

test('pasteLayer ke panel lain: posisi sama, id baru', () => {
  const { b } = setup();
  const src = layersOf(0)[0];
  const r = pasteLayer(useEditor.getState().project!, b, src, false);
  const pasted = r.project.pages[0].scenes[1].panels[0].layers[0];
  expect(pasted).toMatchObject({ x: 100, y: 200, char: '🔥' });
  expect(pasted.id).toBe(r.layerId);
  expect(pasted.id).not.toBe('L1');
});

test('pasteLayer sumber sama: +40,+40', () => {
  const { a } = setup();
  const r = pasteLayer(useEditor.getState().project!, a, layersOf(0)[0], true);
  expect(r.project.pages[0].scenes[0].panels[0].layers[1]).toMatchObject({ x: 140, y: 240 });
});

test('pasteFileName', () => {
  expect(pasteFileName(new Date(2026, 9, 13, 9, 5, 7))).toBe('paste-20261013-090507.png');
});

test('copy lalu paste di scene lain', async () => {
  const { b } = setup();
  const c = clipEvent('copy');
  handleCopy(c);
  expect(c.defaultPrevented).toBe(true);
  useEditor.setState({ currentSceneId: useEditor.getState().project!.pages[0].scenes[1].id, activePanelId: b, selectedLayerId: null, selectedLayerIds: [] });
  const v = clipEvent('paste');
  await handlePaste(v);
  expect(v.defaultPrevented).toBe(true);
  expect(layersOf(1)).toHaveLength(1);
  expect(layersOf(1)[0]).toMatchObject({ x: 100, y: 200 });
  expect(useEditor.getState().selectedLayerId).toBe(layersOf(1)[0].id);
});

test('cut menghapus layer sumber', () => {
  setup();
  handleCut(clipEvent('cut'));
  expect(layersOf(0)).toHaveLength(0);
  expect(useEditor.getState().clipboard?.layers.map((l) => l.id)).toEqual(['L1']);
});

test('handlePaste diabaikan saat target textarea', async () => {
  setup();
  handleCopy(clipEvent('copy'));
  const ta = document.createElement('textarea');
  const v = clipEvent('paste', ta);
  await handlePaste(v);
  expect(v.defaultPrevented).toBe(false);
  expect(layersOf(0)).toHaveLength(1);
  const c = clipEvent('copy', ta);
  handleCopy(c);
  expect(c.defaultPrevented).toBe(false);
});

test('paste gambar ke scene: disimpan sebagai clip (bukan asset), layer ditambah', async () => {
  setup();
  uploadClips.mockResolvedValue([{ ref: 'clip:paste-1.png', name: 'paste-1.png', width: 200, height: 100, url: '' }]);
  const img = new File([new Uint8Array([1, 2])], 'image.png', { type: 'image/png' });
  await handlePaste(clipEvent('paste', document.body, [img]));
  expect(uploadAssets).not.toHaveBeenCalled();
  expect(uploadClips).toHaveBeenCalledTimes(1);
  const [slug, files] = uploadClips.mock.calls[0];
  expect(slug).toBe('a');
  expect((files as File[])[0].name).toMatch(/^paste-\d{8}-\d{6}\.png$/);
  const l = layersOf(0).at(-1)!;
  expect(l).toMatchObject({ type: 'image', ref: 'clip:paste-1.png', x: 540, y: 960, width: 648, height: 324 });
});

test('Ctrl+C pada asset terpilih di panel Asset lalu Ctrl+V → layer asset itu di scene aktif', async () => {
  setup();
  const asset = { ref: 'global:api.png' as const, name: 'api.png', width: 100, height: 200, url: '/files/global/api.png' };
  const tile = document.createElement('div');
  tile.dataset.assetTile = '1';
  document.body.appendChild(tile);
  useEditor.getState().copyAsset(asset);
  useEditor.setState({ selectedLayerId: null });
  await handlePaste(clipEvent('paste', document.body));
  const l = layersOf(0).at(-1)!;
  expect(l).toMatchObject({ type: 'image', ref: 'global:api.png', width: 648, height: 1296 });
  // copying a layer afterwards takes over the clipboard again
  useEditor.setState({ selectedLayerId: l.id });
  handleCopy(clipEvent('copy'));
  expect(useEditor.getState().copiedAsset).toBeNull();
});

test('copy-paste beberapa layer + grup: semua ikut, grup dibuat ulang, selection = hasil paste', async () => {
  const { a } = setup();
  const { groupLayers } = await import('../src/shared/multi');
  useEditor.getState().apply((p) => addLayer(addLayer(p, a, { ...defaultEmoji('⭐', space), id: 'L2' }), a, { ...defaultEmoji('💧', space), id: 'L3' }));
  useEditor.getState().apply((p) => groupLayers(p, a, ['L2', 'L3']).project);
  useEditor.getState().setSelection(['L1', 'L3']); // L3 pulls in its group
  expect(useEditor.getState().selectedLayerIds).toEqual(['L1', 'L2', 'L3']);
  handleCopy(clipEvent('copy'));
  await handlePaste(clipEvent('paste'));
  const ls = layersOf(0);
  expect(ls).toHaveLength(6);
  const pasted = ls.slice(3);
  expect(useEditor.getState().selectedLayerIds).toEqual(pasted.map((l) => l.id));
  expect(pasted[1].groupId).toBeTruthy();
  expect(pasted[1].groupId).toBe(pasted[2].groupId);
  expect(pasted[1].groupId).not.toBe(ls[1].groupId);
  expect(pasted[0]).toMatchObject({ x: 140, y: 240 });
});

test('cut beberapa layer menghapus semuanya', () => {
  const { a } = setup();
  useEditor.getState().apply((p) => addLayer(p, a, { ...defaultEmoji('⭐', space), id: 'L2' }));
  useEditor.getState().setSelection(['L1', 'L2']);
  handleCut(clipEvent('cut'));
  expect(layersOf(0)).toHaveLength(0);
  expect(useEditor.getState().selectedLayerIds).toEqual([]);
});

test('Ctrl+C layer lalu Ctrl+V: layer yang ditempel walau clipboard sistem masih berisi gambar lama', async () => {
  setup();
  const old = new File([new Uint8Array([1, 2])], 'screenshot.png', { type: 'image/png' });
  handleCopy(clipEvent('copy'));
  // OS keeps offering the old screenshot as a file alongside our marker
  await handlePaste(clipEvent('paste', document.body, [old]));
  expect(uploadClips).not.toHaveBeenCalled();
  expect(layersOf(0)).toHaveLength(2);
  expect(layersOf(0)[1]).toMatchObject({ char: '🔥', x: 140, y: 240 });
});

test('setelah menyalin sesuatu di luar aplikasi (marker hilang), Ctrl+V menempel gambar sistem', async () => {
  setup();
  handleCopy(clipEvent('copy'));
  sys = {}; // user copied a screenshot elsewhere: our marker is gone
  uploadClips.mockResolvedValue([{ ref: 'clip:p.png', name: 'p.png', width: 10, height: 10, url: '' }]);
  const shot = new File([new Uint8Array([1])], 'image.png', { type: 'image/png' });
  await handlePaste(clipEvent('paste', document.body, [shot]));
  expect(uploadClips).toHaveBeenCalledTimes(1);
  expect(layersOf(0).at(-1)).toMatchObject({ ref: 'clip:p.png' });
});

test('external text never pastes the stale in-app copy', async () => {
  setup();
  handleCopy(clipEvent('copy'));
  sys = { 'text/plain': 'copied outside the app' };
  const event = clipEvent('paste');
  await handlePaste(event);
  expect(event.defaultPrevented).toBe(false);
  expect(layersOf(0)).toHaveLength(1);
});

test('desktop empty paste reads native marker before an older OS image', async () => {
  setup();
  native.desktop = true;
  handleCopy(clipEvent('copy'));
  const marker = sys['text/plain'];
  sys = {};
  native.readText.mockResolvedValue(marker);
  await handlePaste(clipEvent('paste'));
  expect(layersOf(0)).toHaveLength(2);
  expect(layersOf(0)[1]).toMatchObject({ char: '🔥' });
  expect(native.readImage).not.toHaveBeenCalled();
});

test('desktop empty event with external text or no image does not revive a stale copy', async () => {
  setup();
  native.desktop = true;
  handleCopy(clipEvent('copy'));
  sys = {};
  native.readText.mockResolvedValue('external text');
  native.readImage.mockRejectedValue('The clipboard contents were not available in the requested format or the clipboard is empty.');
  await handlePaste(clipEvent('paste'));
  expect(layersOf(0)).toHaveLength(1);
  native.readText.mockResolvedValue('');
  native.readImage.mockResolvedValue(null);
  await handlePaste(clipEvent('paste'));
  expect(layersOf(0)).toHaveLength(1);
  expect(useUi.getState().toasts).toEqual([]);
});

test('desktop native image replaces old layer copy even when optional text negotiation fails', async () => {
  setup();
  native.desktop = true;
  handleCopy(clipEvent('copy'));
  sys = {};
  native.readText.mockRejectedValue('Unknown error while interacting with clipboard: incorrect type received from clipboard');
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
  const close = vi.fn().mockResolvedValue(undefined);
  native.readImage.mockResolvedValue({ rgba: async () => pixels, size: async () => ({ width: 2, height: 1 }), close });
  let encoded: { data: Uint8ClampedArray; width: number; height: number } | undefined;
  const context = { createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }), putImageData: (image: typeof encoded) => { encoded = image; } };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
    expect(this.width).toBe(2);
    expect(this.height).toBe(1);
    callback(new Blob(['encoded-png'], { type: 'image/png' }));
  });
  uploadClips.mockResolvedValue([{ ref: 'clip:native.png', name: 'native.png', width: 2, height: 1, url: '' }]);
  try {
    await handlePaste(clipEvent('paste'));
    expect(encoded?.data).toEqual(new Uint8ClampedArray(pixels));
    expect(uploadClips.mock.calls[0][1][0]).toMatchObject({ type: 'image/png', size: 11 });
    expect(layersOf(0)).toHaveLength(2);
    expect(layersOf(0)[1]).toMatchObject({ type: 'image', ref: 'clip:native.png' });
    expect(close).toHaveBeenCalledOnce();
    expect(useUi.getState().toasts).toEqual([]);
  } finally {
    getContext.mockRestore();
    toBlob.mockRestore();
  }
});

test('image upload finishing after project or panel switch never adds a layer there', async () => {
  const { b } = setup();
  const pending = Promise.withResolvers<{ ref: string; name: string; width: number; height: number; url: string }[]>();
  uploadClips.mockReturnValue(pending.promise);
  const paste = handlePaste(clipEvent('paste', document.body, [new File(['image'], 'image.png', { type: 'image/png' })]));
  useEditor.setState({ activePanelId: b });
  pending.resolve([{ ref: 'clip:late.png', name: 'late.png', width: 10, height: 10, url: '' }]);
  await paste;
  expect(layersOf(0)).toHaveLength(1);
  expect(layersOf(1)).toHaveLength(0);
});

test('desktop copied local file URI uses narrow image command instead of stale layers', async () => {
  setup();
  native.desktop = true;
  handleCopy(clipEvent('copy'));
  sys = {};
  native.readText.mockResolvedValue('# clipboard file\nfile:///tmp/copied.png\nhttps://example.com/remote.png');
  native.readLocalImages.mockResolvedValue([new File(['png'], 'copied.png', { type: 'image/png' })]);
  uploadClips.mockResolvedValue([{ ref: 'clip:copied.png', name: 'copied.png', width: 1, height: 1, url: '' }]);
  await handlePaste(clipEvent('paste'));
  expect(native.readLocalImages).toHaveBeenCalledWith(['file:///tmp/copied.png']);
  expect(native.readImage).not.toHaveBeenCalled();
  expect(layersOf(0)[1]).toMatchObject({ type: 'image', ref: 'clip:copied.png' });
});

test('desktop clipboard permission errors are shown instead of hidden as an empty clipboard', async () => {
  setup();
  native.desktop = true;
  native.readText.mockResolvedValue('');
  native.readImage.mockRejectedValue('clipboard-manager.read_image not allowed');
  await handlePaste(clipEvent('paste'));
  expect(layersOf(0)).toHaveLength(1);
  expect(useUi.getState().toasts).toEqual([expect.objectContaining({ kind: 'err', text: expect.stringContaining('not allowed') })]);
});

test('desktop textarea and input paste never read the native clipboard', async () => {
  setup();
  native.desktop = true;
  for (const tag of ['input', 'textarea']) {
    const event = clipEvent('paste', document.createElement(tag));
    await handlePaste(event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(native.readText).not.toHaveBeenCalled();
  expect(native.readImage).not.toHaveBeenCalled();
});

test('native clipboard read finishing after project switch cannot paste into either project', async () => {
  setup();
  native.desktop = true;
  handleCopy(clipEvent('copy'));
  const marker = sys['text/plain'];
  sys = {};
  const pending = Promise.withResolvers<string>();
  native.readText.mockReturnValue(pending.promise);
  const paste = handlePaste(clipEvent('paste'));
  const project = withPageSizes(createProject('Other', 'later'), [1]);
  useEditor.setState({ slug: 'other', project, activePanelId: project.pages[0].scenes[0].panels[0].id });
  pending.resolve(marker);
  await paste;
  expect(layersOf(0)).toHaveLength(0);
  expect(uploadClips).not.toHaveBeenCalled();
  expect(native.readImage).not.toHaveBeenCalled();
});

test('native image with no pixels is an empty clipboard, not an upload failure', async () => {
  setup();
  native.desktop = true;
  native.readText.mockResolvedValue('');
  native.readImage.mockResolvedValue({ size: async () => ({ width: 0, height: 0 }), rgba: async () => new Uint8Array(), close: async () => undefined });
  await handlePaste(clipEvent('paste'));
  expect(layersOf(0)).toHaveLength(1);
  expect(uploadClips).not.toHaveBeenCalled();
  expect(useUi.getState().toasts).toEqual([]);
});

test('desktop Ctrl/Cmd+V pastes into the scene without requiring a WebKit paste event', async () => {
  setup();
  native.desktop = true;
  handleCopy(clipEvent('copy'));
  native.readText.mockResolvedValue(sys['text/plain']);
  const clipboardEvent = globalThis.ClipboardEvent;
  if (!clipboardEvent) vi.stubGlobal('ClipboardEvent', Event);
  const uninstall = installClipboard('a', () => undefined);
  try {
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      const event = new KeyboardEvent('keydown', { key: 'v', ...modifier, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      await Promise.resolve();
    }
    expect(layersOf(0)).toHaveLength(3);
    expect(layersOf(0)[1]).toMatchObject({ char: '🔥' });
    expect(native.readImage).not.toHaveBeenCalled();
    uninstall();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(layersOf(0)).toHaveLength(3);
  } finally {
    uninstall();
    if (!clipboardEvent) vi.unstubAllGlobals();
  }
});

test('desktop paste shortcut preserves native inputs and browser paste remains event-driven', () => {
  setup();
  const uninstall = installClipboard('a', () => undefined);
  try {
    native.desktop = true;
    for (const tag of ['input', 'textarea']) {
      const input = document.createElement(tag);
      document.body.appendChild(input);
      const event = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      input.remove();
    }
    for (const modifier of [{ altKey: true }, { shiftKey: true }]) {
      const event = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, ...modifier, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    native.desktop = false;
    const event = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(native.readText).not.toHaveBeenCalled();
  } finally {
    uninstall();
  }
});

test('optional marker read failure remains visible if native clipboard has no image', async () => {
  setup();
  native.desktop = true;
  native.readText.mockRejectedValue('clipboard-manager.read_text not allowed');
  native.readImage.mockResolvedValue(null);
  await handlePaste(clipEvent('paste'));
  expect(layersOf(0)).toHaveLength(1);
  expect(useUi.getState().toasts).toEqual([expect.objectContaining({ kind: 'err', text: expect.stringContaining('read_text not allowed') })]);
});
