import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { addPage, createProject, updateScene, withPageSizes } from '../src/shared/model';

const saveProject = vi.fn();
const getProject = vi.fn();
const agentAck = vi.fn();
const toast = vi.fn();
vi.mock('../src/web/api', () => ({
  api: {
    getProject: (...a: unknown[]) => getProject(...a),
    saveProject: (...a: unknown[]) => saveProject(...a),
    agentAck: (...a: unknown[]) => agentAck(...a),
  },
}));
vi.mock('../src/web/state/uiStore', () => ({ toast: (...a: unknown[]) => toast(...a) }));

const { useEditor, AUTOSAVE_MS } = await import('../src/web/state/editorStore');

const base = createProject('A', '2026-10-12T00:00:00Z');
const sid = base.pages[0].scenes[0].id;
const sub = () => useEditor.getState().project!.pages[0].scenes[0].subtitle;

beforeEach(async () => {
  vi.useFakeTimers();
  saveProject.mockReset().mockResolvedValue({ updatedAt: '2026-10-12T00:00:01Z' });
  getProject.mockReset().mockResolvedValue(structuredClone(base));
  agentAck.mockReset().mockResolvedValue({ ok: true });
  toast.mockReset();
  useEditor.getState().reset();
  await useEditor.getState().load('a');
  useEditor.getState().setClientId('c1');
});
afterEach(() => vi.useRealTimers());

test('setAgent(true): edit belum tersimpan di-flush dulu, baru ack', async () => {
  useEditor.getState().apply((p) => updateScene(p, sid, { subtitle: 'belum' }));
  expect(useEditor.getState().saveStatus).toBe('dirty');
  await useEditor.getState().setAgent(true, '2026-10-13T00:00:00Z');
  expect(saveProject).toHaveBeenCalledTimes(1);
  expect(saveProject.mock.calls[0][1].pages[0].scenes[0].subtitle).toBe('belum');
  expect(agentAck).toHaveBeenCalledWith('a', 'c1');
  expect(saveProject.mock.invocationCallOrder[0]).toBeLessThan(agentAck.mock.invocationCallOrder[0]);
  expect(useEditor.getState().agentActive).toBe(true);
  expect(useEditor.getState().agentSince).toBe('2026-10-13T00:00:00Z');
});

test('selama agent aktif: apply/undo/redo no-op, tidak ada autosave', async () => {
  useEditor.getState().apply((p) => updateScene(p, sid, { subtitle: 'satu' }));
  await useEditor.getState().setAgent(true, null);
  saveProject.mockClear();
  useEditor.getState().apply((p) => updateScene(p, sid, { subtitle: 'dua' }));
  expect(sub()).toBe('satu');
  useEditor.getState().undo();
  expect(sub()).toBe('satu');
  await vi.advanceTimersByTimeAsync(5000);
  expect(saveProject).not.toHaveBeenCalled();
});

test('remoteProject: masuk riwayat, status saved, tanpa autosave; undo setelah agent selesai tersimpan', async () => {
  await useEditor.getState().setAgent(true, null);
  saveProject.mockClear();
  const p1 = updateScene(useEditor.getState().project!, sid, { subtitle: 'agent 1' });
  const p2 = updateScene(p1, sid, { subtitle: 'agent 2' });
  useEditor.getState().remoteProject(p1);
  useEditor.getState().remoteProject(p2);
  expect(sub()).toBe('agent 2');
  expect(useEditor.getState().past).toHaveLength(2);
  expect(useEditor.getState().saveStatus).toBe('saved');
  await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 100);
  expect(saveProject).not.toHaveBeenCalled();

  useEditor.getState().setAgent(false, null);
  expect(toast).toHaveBeenCalledWith('info', 'AI selesai mengedit');
  useEditor.getState().undo();
  expect(sub()).toBe('agent 1');
  expect(useEditor.getState().saveStatus).toBe('dirty');
  await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 100);
  expect(saveProject).toHaveBeenCalledTimes(1);
  expect(saveProject.mock.calls[0][1].pages[0].scenes[0].subtitle).toBe('agent 1');
});

test('remoteProject yang menghapus scene terpilih memindah seleksi', async () => {
  const two = withPageSizes(base, [1, 1]);
  getProject.mockResolvedValue(structuredClone(two));
  await useEditor.getState().load('a');
  const second = two.pages[1].scenes[0].id;
  useEditor.getState().selectScene(second);
  const removed = { ...two, pages: [two.pages[0]] };
  useEditor.getState().remoteProject(removed);
  expect(useEditor.getState().currentSceneId).toBe(two.pages[0].scenes[0].id);
});

test('remoteProject menambah page tanpa mengubah scene terpilih', async () => {
  const r = addPage(useEditor.getState().project!, useEditor.getState().project!.pages[0].id);
  useEditor.getState().remoteProject(r.project);
  expect(useEditor.getState().currentSceneId).toBe(sid);
  expect(useEditor.getState().project!.pages).toHaveLength(2);
});

test('save ditolak 423 → status error dengan pesan AI, retry dijadwalkan', async () => {
  saveProject.mockReset().mockRejectedValueOnce(new Error('AI sedang mengedit project ini')).mockResolvedValue({ updatedAt: '2026-10-12T00:00:02Z' });
  useEditor.getState().apply((p) => updateScene(p, sid, { subtitle: 'x' }));
  await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 10);
  expect(useEditor.getState().saveStatus).toBe('error');
  expect(useEditor.getState().saveError).toBe('AI sedang mengedit project ini');
  await vi.advanceTimersByTimeAsync(6000);
  expect(useEditor.getState().saveStatus).toBe('saved');
});

test('hello: agent aktif di server → editor ikut terkunci; tidak aktif → buka', async () => {
  useEditor.getState().onLive({ type: 'hello', clientId: 'c9', agent: { active: true, since: 'S' } });
  await vi.advanceTimersByTimeAsync(0);
  expect(useEditor.getState().agentActive).toBe(true);
  expect(agentAck).toHaveBeenCalledWith('a', 'c9');
  useEditor.getState().onLive({ type: 'hello', clientId: 'c10', agent: { active: false, since: null } });
  expect(useEditor.getState().agentActive).toBe(false);
});
