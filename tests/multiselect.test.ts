import { expect, test } from 'vitest';
import { addLayer, createProject, defaultEmoji } from '../src/shared/model';
import { moveLayersTo, expandGroups, groupLayers, moveLayers, pasteLayers, removeLayers, reorderLayers, setLayersOpacity, ungroupLayers, layersInRect } from '../src/shared/multi';
import type { Layer, Project } from '../src/shared/types';
import { parseProject } from '../src/shared/schema';

const space = { w: 1080, h: 1920 };
function setup(n = 4): { p: Project; pn: string } {
  let p = createProject('A', 'now');
  const pn = p.pages[0].scenes[0].panels[0].id;
  for (let i = 0; i < n; i++) p = addLayer(p, pn, { ...defaultEmoji('🔥', space), id: `L${i}`, x: 100 * i, y: 100 * i, size: 100 });
  return { p, pn };
}
const layers = (p: Project) => p.pages[0].scenes[0].panels[0].layers;

test('groupLayers memberi groupId sama & menyatukan urutan di posisi anggota paling depan', () => {
  const { p, pn } = setup();
  const { project, groupId } = groupLayers(p, pn, ['L0', 'L2']);
  expect(groupId).toBeTruthy();
  expect(layers(project).map((l) => l.id)).toEqual(['L1', 'L0', 'L2', 'L3']);
  expect(layers(project).filter((l) => l.groupId === groupId).map((l) => l.id)).toEqual(['L0', 'L2']);
  expect(() => parseProject(project)).not.toThrow();
  expect(parseProject(project).pages[0].scenes[0].panels[0].layers[1].groupId).toBe(groupId);
});

test('grup dari grup diratakan (tidak bersarang); < 2 layer tidak membuat grup', () => {
  const { p, pn } = setup();
  const a = groupLayers(p, pn, ['L0', 'L1']);
  const b = groupLayers(a.project, pn, ['L1', 'L2']);
  // L1 belongs to group a → whole group a joins
  expect(layers(b.project).filter((l) => l.groupId === b.groupId).map((l) => l.id).sort()).toEqual(['L0', 'L1', 'L2']);
  expect(groupLayers(p, pn, ['L0']).groupId).toBeNull();
});

test('ungroupLayers melepas seluruh grup dari anggota yang terpilih', () => {
  const { p, pn } = setup();
  const g = groupLayers(p, pn, ['L0', 'L1']).project;
  const u = ungroupLayers(g, pn, ['L1']);
  expect(layers(u).every((l) => !l.groupId)).toBe(true);
});

test('expandGroups: memilih satu anggota = seluruh grup', () => {
  const { p, pn } = setup();
  const g = groupLayers(p, pn, ['L1', 'L3']).project;
  expect(expandGroups(layers(g), ['L3']).sort()).toEqual(['L1', 'L3']);
  expect(expandGroups(layers(g), ['L0'])).toEqual(['L0']);
});

test('moveLayers menggeser semua terpilih', () => {
  const { p, pn } = setup();
  const m = moveLayers(p, pn, ['L1', 'L2'], 10, -5);
  expect(layers(m).map((l) => [l.x, l.y])).toEqual([[0, 0], [110, 95], [210, 195], [300, 300]]);
});

test('removeLayers & setLayersOpacity', () => {
  const { p, pn } = setup();
  expect(layers(removeLayers(p, pn, ['L0', 'L3'])).map((l) => l.id)).toEqual(['L1', 'L2']);
  expect(layers(setLayersOpacity(p, pn, ['L1', 'L2'], 40)).map((l) => l.opacity)).toEqual([1, 0.4, 0.4, 1]);
});

test('pasteLayers: id baru, grup dipertahankan dengan groupId baru, +40 bila sumber sama', () => {
  const { p, pn } = setup();
  const g = groupLayers(p, pn, ['L0', 'L1']);
  const src = layers(g.project).filter((l) => ['L0', 'L1', 'L3'].includes(l.id)).map((l) => structuredClone(l)) as Layer[];
  const r = pasteLayers(g.project, pn, src, true);
  expect(r.layerIds).toHaveLength(3);
  const added = layers(r.project).slice(-3);
  expect(added.map((l) => l.id)).toEqual(r.layerIds);
  expect(added.every((l) => !['L0', 'L1', 'L3'].includes(l.id))).toBe(true);
  expect(added[0].groupId).toBeTruthy();
  expect(added[0].groupId).toBe(added[1].groupId);
  expect(added[0].groupId).not.toBe(g.groupId);
  expect(added[2].groupId).toBeUndefined();
  expect(added[0].x).toBe(src[0].x + 40);
  // pasting into another panel keeps positions
  const other = pasteLayers(g.project, pn, src, false);
  expect(layers(other.project).slice(-3)[0].x).toBe(src[0].x);
});

test('reorderLayers memindah blok terpilih ke depan/belakang dengan urutan relatif tetap', () => {
  const { p, pn } = setup();
  expect(layers(reorderLayers(p, pn, ['L0', 'L2'], 'top')).map((l) => l.id)).toEqual(['L1', 'L3', 'L0', 'L2']);
  expect(layers(reorderLayers(p, pn, ['L1', 'L3'], 'bottom')).map((l) => l.id)).toEqual(['L1', 'L3', 'L0', 'L2']);
  expect(layers(reorderLayers(p, pn, ['L0', 'L1'], 'up')).map((l) => l.id)).toEqual(['L2', 'L0', 'L1', 'L3']);
  expect(layers(reorderLayers(p, pn, ['L2', 'L3'], 'down')).map((l) => l.id)).toEqual(['L0', 'L2', 'L3', 'L1']);
});

test('layersInRect: kotak seleksi memilih layer yang bersinggungan', () => {
  const boxes = [
    { id: 'a', x: 0, y: 0, width: 50, height: 50 },
    { id: 'b', x: 200, y: 200, width: 50, height: 50 },
    { id: 'c', x: 40, y: 40, width: 20, height: 20 },
  ];
  expect(layersInRect(boxes, { x: 30, y: 30, width: 20, height: 20 }).sort()).toEqual(['a', 'c']);
  expect(layersInRect(boxes, { x: 260, y: 260, width: -100, height: -100 })).toEqual(['b']);
});

test('moveLayersTo: taruh di depan/belakang layer lain (urutan array = belakang → depan)', () => {
  const { p, pn } = setup();
  expect(layers(moveLayersTo(p, pn, ['L0'], 'L2', 'front', null)).map((l) => l.id)).toEqual(['L1', 'L2', 'L0', 'L3']);
  expect(layers(moveLayersTo(p, pn, ['L3'], 'L1', 'back', null)).map((l) => l.id)).toEqual(['L0', 'L3', 'L1', 'L2']);
  // several at once keep their relative order
  expect(layers(moveLayersTo(p, pn, ['L0', 'L1'], 'L3', 'front', null)).map((l) => l.id)).toEqual(['L2', 'L3', 'L0', 'L1']);
});

test('moveLayersTo: drop di antara anggota grup = ikut grup itu; keluar dari grup = lepas grup', () => {
  const { p, pn } = setup();
  const g = groupLayers(p, pn, ['L1', 'L2']);
  const joined = moveLayersTo(g.project, pn, ['L3'], 'L1', 'front', g.groupId);
  expect(layers(joined).map((l) => l.id)).toEqual(['L0', 'L1', 'L3', 'L2']);
  expect(layers(joined).find((l) => l.id === 'L3')!.groupId).toBe(g.groupId);
  // a member dragged out next to a plain layer leaves its group (group of 1 is dissolved)
  const out = moveLayersTo(g.project, pn, ['L2'], 'L0', 'back', null);
  expect(layers(out).map((l) => l.id)).toEqual(['L2', 'L0', 'L1', 'L3']);
  expect(layers(out).every((l) => !l.groupId)).toBe(true);
  // the whole group dragged keeps its group
  const whole = moveLayersTo(g.project, pn, ['L1', 'L2'], 'L3', 'front', null);
  expect(layers(whole).map((l) => l.id)).toEqual(['L0', 'L3', 'L1', 'L2']);
  expect(layers(whole).filter((l) => l.groupId === g.groupId)).toHaveLength(2);
  // anchor inside the dragged set → no-op
  expect(moveLayersTo(g.project, pn, ['L1', 'L2'], 'L1', 'front', null)).toBe(g.project);
});

test('reorderLayers naik/turun satu layer melompati grup utuh (grup tidak terbelah)', () => {
  const { p, pn } = setup();
  const g = groupLayers(p, pn, ['L1', 'L2']).project; // L0 [L1 L2] L3
  expect(layers(reorderLayers(g, pn, ['L0'], 'up')).map((l) => l.id)).toEqual(['L1', 'L2', 'L0', 'L3']);
  expect(layers(reorderLayers(g, pn, ['L3'], 'down')).map((l) => l.id)).toEqual(['L0', 'L3', 'L1', 'L2']);
});
