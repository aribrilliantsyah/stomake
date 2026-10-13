import { beforeEach, expect, test, vi } from 'vitest';
vi.mock('../src/web/api', () => ({ api: { getProject: vi.fn(), saveProject: vi.fn().mockResolvedValue({ updatedAt: 'x' }) } }));
import { addLayer, createProject, defaultEmoji } from '../src/shared/model';
import { groupLayers } from '../src/shared/multi';

const { useEditor } = await import('../src/web/state/editorStore');
const space = { w: 1080, h: 1920 };

function setup() {
  let p = createProject('A', 'now');
  const pn = p.pages[0].scenes[0].panels[0].id;
  for (let i = 0; i < 4; i++) p = addLayer(p, pn, { ...defaultEmoji('🔥', space), id: `L${i}` });
  p = groupLayers(p, pn, ['L1', 'L2']).project;
  useEditor.setState({ project: p, slug: 'a', currentSceneId: p.pages[0].scenes[0].id, selectedCover: false, activePanelId: pn, selectedLayerId: null, selectedLayerIds: [], past: [], future: [] });
  return pn;
}
beforeEach(() => void setup());
const ids = () => useEditor.getState().selectedLayerIds;

test('selectLayer memilih seluruh grup; primary = yang diklik', () => {
  useEditor.getState().selectLayer('L2');
  expect(ids()).toEqual(['L1', 'L2']);
  expect(useEditor.getState().selectedLayerId).toBe('L2');
  useEditor.getState().selectLayer('L0');
  expect(ids()).toEqual(['L0']);
});

test('selectLayer single (double-click) memilih satu anggota grup saja', () => {
  useEditor.getState().selectLayer('L1', { single: true });
  expect(ids()).toEqual(['L1']);
});

test('toggleLayer (Shift/Ctrl+klik) menambah/mengurangi, termasuk seluruh grup', () => {
  const s = useEditor.getState();
  s.selectLayer('L0');
  s.toggleLayer('L1');
  expect(ids()).toEqual(['L0', 'L1', 'L2']);
  s.toggleLayer('L2');
  expect(ids()).toEqual(['L0']);
  s.toggleLayer('L0');
  expect(ids()).toEqual([]);
  expect(useEditor.getState().selectedLayerId).toBeNull();
});

test('setSelection (marquee / Ctrl+A) & selectLayer(null)', () => {
  useEditor.getState().setSelection(['L3', 'L1']);
  expect(ids()).toEqual(['L1', 'L2', 'L3']);
  useEditor.getState().selectLayer(null);
  expect(ids()).toEqual([]);
});

test('undo/hapus membersihkan id yang hilang dari selection', async () => {
  const { removeLayers } = await import('../src/shared/multi');
  const s = useEditor.getState();
  s.setSelection(['L0', 'L3']);
  s.apply((p) => removeLayers(p, s.activePanelId!, ['L3']));
  expect(ids()).toEqual(['L0']);
});
