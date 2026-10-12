import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createProject, updateScene } from '../src/shared/model';

const saveProject = vi.fn();
const getProject = vi.fn();
vi.mock('../src/web/api', () => ({
  api: {
    getProject: (...a: unknown[]) => getProject(...a),
    saveProject: (...a: unknown[]) => saveProject(...a),
  },
}));

const { useEditor, HISTORY_LIMIT } = await import('../src/web/state/editorStore');

const base = createProject('A', '2026-10-12T00:00:00Z');
const sid = base.pages[0].scenes[0].id;
const sub = () => useEditor.getState().project!.pages[0].scenes[0].subtitle;

beforeEach(async () => {
  vi.useFakeTimers();
  saveProject.mockReset().mockResolvedValue({ updatedAt: '2026-10-12T00:00:01Z' });
  getProject.mockReset().mockResolvedValue(structuredClone(base));
  useEditor.getState().reset();
  await useEditor.getState().load('a');
});
afterEach(() => vi.useRealTimers());

test('load memilih scene pertama & status saved', () => {
  const s = useEditor.getState();
  expect(s.slug).toBe('a');
  expect(s.currentSceneId).toBe(sid);
  expect(s.activePanelId).toBe(base.pages[0].scenes[0].panels[0].id);
  expect(s.saveStatus).toBe('saved');
});

test('apply lalu undo/redo', () => {
  const { apply, undo, redo } = useEditor.getState();
  apply((p) => updateScene(p, sid, { subtitle: 'satu' }));
  apply((p) => updateScene(p, sid, { subtitle: 'dua' }));
  expect(sub()).toBe('dua');
  undo();
  expect(sub()).toBe('satu');
  undo();
  expect(sub()).toBe('');
  undo();
  expect(sub()).toBe('');
  redo();
  expect(sub()).toBe('satu');
  apply((p) => updateScene(p, sid, { subtitle: 'tiga' }));
  redo();
  expect(sub()).toBe('tiga');
});

test('history dibatasi 100', () => {
  expect(HISTORY_LIMIT).toBe(100);
  const { apply, undo } = useEditor.getState();
  for (let i = 1; i <= 150; i++) apply((p) => updateScene(p, sid, { subtitle: String(i) }));
  for (let i = 0; i < 200; i++) undo();
  expect(sub()).toBe('50');
});

test('coalesceKey menggabungkan perubahan dalam 500ms', () => {
  const { apply, undo } = useEditor.getState();
  apply((p) => updateScene(p, sid, { subtitle: 'k' }), { coalesceKey: 'sub' });
  vi.advanceTimersByTime(200);
  apply((p) => updateScene(p, sid, { subtitle: 'ke' }), { coalesceKey: 'sub' });
  vi.advanceTimersByTime(200);
  apply((p) => updateScene(p, sid, { subtitle: 'ken' }), { coalesceKey: 'sub' });
  vi.advanceTimersByTime(600);
  apply((p) => updateScene(p, sid, { subtitle: 'kena' }), { coalesceKey: 'sub' });
  undo();
  expect(sub()).toBe('ken');
  undo();
  expect(sub()).toBe('');
});

test('autosave dipanggil sekali 1500ms setelah perubahan terakhir', async () => {
  const { apply } = useEditor.getState();
  apply((p) => updateScene(p, sid, { subtitle: 'a' }));
  expect(useEditor.getState().saveStatus).toBe('dirty');
  await vi.advanceTimersByTimeAsync(1000);
  apply((p) => updateScene(p, sid, { subtitle: 'ab' }));
  await vi.advanceTimersByTimeAsync(1499);
  expect(saveProject).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(saveProject).toHaveBeenCalledTimes(1);
  expect(saveProject.mock.calls[0][0]).toBe('a');
  expect(saveProject.mock.calls[0][1].pages[0].scenes[0].subtitle).toBe('ab');
  expect(useEditor.getState().saveStatus).toBe('saved');
  expect(useEditor.getState().project!.updatedAt).toBe('2026-10-12T00:00:01Z');
});

test('save gagal → status error, retry setelah 5000ms → saved', async () => {
  saveProject.mockRejectedValueOnce(new Error('offline'));
  useEditor.getState().apply((p) => updateScene(p, sid, { subtitle: 'x' }));
  await vi.advanceTimersByTimeAsync(1500);
  expect(useEditor.getState().saveStatus).toBe('error');
  await vi.advanceTimersByTimeAsync(5000);
  expect(saveProject).toHaveBeenCalledTimes(2);
  expect(useEditor.getState().saveStatus).toBe('saved');
});

test('undo tidak mengubah updatedAt hasil save', async () => {
  const { apply, undo } = useEditor.getState();
  apply((p) => updateScene(p, sid, { subtitle: 'x' }));
  await vi.advanceTimersByTimeAsync(1500);
  undo();
  expect(useEditor.getState().project!.updatedAt).toBe('2026-10-12T00:00:01Z');
});

test('flush menunggu save yang sedang berjalan lalu menyimpan edit terbaru', async () => {
  let release!: () => void;
  saveProject.mockImplementationOnce(() => new Promise((res) => (release = () => res({ updatedAt: '2026-10-12T00:00:01Z' }))));
  const { apply, flush } = useEditor.getState();
  apply((p) => updateScene(p, sid, { subtitle: 'satu' }));
  await vi.advanceTimersByTimeAsync(1500); // save #1 in flight
  apply((p) => updateScene(p, sid, { subtitle: 'dua' }));
  const done = flush();
  release();
  await vi.advanceTimersByTimeAsync(0);
  await done;
  expect(saveProject.mock.calls.at(-1)![1].pages[0].scenes[0].subtitle).toBe('dua');
  expect(useEditor.getState().saveStatus).toBe('saved');
});

test('load project lain menyimpan dulu perubahan yang tertunda', async () => {
  useEditor.getState().apply((p) => updateScene(p, sid, { subtitle: 'belum tersimpan' }));
  await useEditor.getState().load('b');
  expect(saveProject).toHaveBeenCalledTimes(1);
  expect(saveProject.mock.calls[0][0]).toBe('a');
  expect(saveProject.mock.calls[0][1].pages[0].scenes[0].subtitle).toBe('belum tersimpan');
});
