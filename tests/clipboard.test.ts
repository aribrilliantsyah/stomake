// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { addLayer, createProject, defaultEmoji, pasteFileName, pasteLayer, withPageSizes } from '../src/shared/model';

const uploadAssets = vi.fn();
vi.mock('../src/web/api', () => ({
  api: {
    getProject: vi.fn(),
    saveProject: vi.fn().mockResolvedValue({ updatedAt: 'x' }),
    uploadAssets: (...a: unknown[]) => uploadAssets(...a),
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
  useEditor.setState({ project: p, slug: 'a', currentSceneId: p.pages[0].scenes[0].id, selectedCover: false, activePanelId: a, selectedLayerId: 'L1', past: [], future: [], clipboard: null });
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
  useEditor.setState({ currentSceneId: useEditor.getState().project!.pages[0].scenes[1].id, activePanelId: b, selectedLayerId: null });
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
  expect(useEditor.getState().clipboard?.layer.id).toBe('L1');
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

test('handlePaste dengan file image memanggil uploadAssets lalu menambah layer', async () => {
  setup();
  uploadAssets.mockResolvedValue([{ ref: 'project:paste-1.png', name: 'paste-1.png', width: 200, height: 100, url: '' }]);
  const img = new File([new Uint8Array([1, 2])], 'image.png', { type: 'image/png' });
  const v = clipEvent('paste', document.body, [img]);
  await handlePaste(v);
  expect(uploadAssets).toHaveBeenCalledTimes(1);
  const [scope, files, slug] = uploadAssets.mock.calls[0];
  expect(scope).toBe('project');
  expect(slug).toBe('a');
  expect((files as File[])[0].name).toMatch(/^paste-\d{8}-\d{6}\.png$/);
  const l = layersOf(0).at(-1)!;
  expect(l).toMatchObject({ type: 'image', ref: 'project:paste-1.png', x: 540, y: 960, width: 648, height: 324 });
});
