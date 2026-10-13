// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { addLayer, createProject, defaultEmoji, pasteFileName, pasteLayer, withPageSizes } from '../src/shared/model';

const uploadAssets = vi.fn();
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

function clipEvent(type: string, target: EventTarget = document.body, files: File[] = []) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(e, 'target', { value: target });
  Object.defineProperty(e, 'clipboardData', { value: { files, types: files.length ? ['Files'] : [], setData: vi.fn(), getData: () => '' } });
  return e;
}

beforeEach(() => {
  uploadAssets.mockReset();
  uploadClips.mockReset();
  useEditor.setState({ copiedAsset: null });
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
