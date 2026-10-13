import { expect, test } from 'vitest';
import {
  addLayer,
  createProject,
  defaultArrow,
  defaultEmoji,
  defaultText,
  layerFromDrop,
  removeLayer,
  reorderLayer,
  updateLayer,
  setLayerOpacity,
  defaultShape,
} from '../src/shared/model';
import type { Project } from '../src/shared/types';

test('layerFromDrop: lebar 60% frame, rasio asli, pusat di titik drop', () => {
  const l = layerFromDrop(
    { ref: 'project:todoroki.png', name: 'todoroki.png', width: 2295, height: 4080, url: '' },
    540,
    960,
    { w: 1080, h: 1920 },
  );
  expect(l).toMatchObject({ type: 'image', ref: 'project:todoroki.png', x: 540, y: 960, width: 648, height: 1152, rotation: 0, opacity: 1, flipX: false, flipY: false });
  expect(l.id).toBeTruthy();
});

test('layerFromDrop panel split memakai lebar yang sama', () => {
  const l = layerFromDrop({ ref: 'global:dont .png', name: 'dont .png', width: 1080, height: 1080, url: '' }, 100, 100, { w: 1080, h: 960 });
  expect(l).toMatchObject({ width: 648, height: 648 });
});

test('default layer di tengah panel', () => {
  expect(defaultText({ w: 1080, h: 1920 })).toMatchObject({ type: 'text', text: 'TEKS', font: 'Bangers', fontSize: 120, fill: '#000000', stroke: '#FFFFFF', strokeWidth: 8, x: 540, y: 960 });
  expect(defaultArrow({ w: 1080, h: 960 })).toMatchObject({ type: 'arrow', points: [0, 0, 0, -300], strokeWidth: 18, color: '#000000', x: 540, y: 480 });
  expect(defaultEmoji('🔥', { w: 1080, h: 1920 })).toMatchObject({ type: 'emoji', char: '🔥', size: 200, x: 540, y: 960 });
});

function setup() {
  let p: Project = createProject('A', 'now');
  const panelId = p.pages[0].scenes[0].panels[0].id;
  const ids = ['a', 'b', 'c'];
  for (const id of ids) p = addLayer(p, panelId, { ...defaultEmoji('🔥', { w: 1080, h: 1920 }), id });
  const order = (q: Project) => q.pages[0].scenes[0].panels[0].layers.map((l) => l.id);
  return { p, panelId, order };
}

test('addLayer menambah di paling depan', () => {
  const { p, order } = setup();
  expect(order(p)).toEqual(['a', 'b', 'c']);
});

test('reorder top/bottom/up/down', () => {
  const { p, panelId, order } = setup();
  expect(order(reorderLayer(p, panelId, 'a', 'top'))).toEqual(['b', 'c', 'a']);
  expect(order(reorderLayer(p, panelId, 'c', 'bottom'))).toEqual(['c', 'a', 'b']);
  expect(order(reorderLayer(p, panelId, 'a', 'up'))).toEqual(['b', 'a', 'c']);
  expect(order(reorderLayer(p, panelId, 'c', 'down'))).toEqual(['a', 'c', 'b']);
  expect(reorderLayer(p, panelId, 'c', 'up')).toBe(p);
  expect(reorderLayer(p, panelId, 'a', 'down')).toBe(p);
});

test('updateLayer tidak mengubah layer lain', () => {
  const { p, panelId } = setup();
  const q = updateLayer(p, panelId, 'b', { x: 10, rotation: 45 });
  const ls = q.pages[0].scenes[0].panels[0].layers;
  expect(ls[1]).toMatchObject({ id: 'b', x: 10, rotation: 45, char: '🔥' });
  expect(ls[0]).toBe(p.pages[0].scenes[0].panels[0].layers[0]);
  expect(ls[2]).toBe(p.pages[0].scenes[0].panels[0].layers[2]);
});

test('removeLayer', () => {
  const { p, panelId, order } = setup();
  expect(order(removeLayer(p, panelId, 'b'))).toEqual(['a', 'c']);
});

test('setLayerOpacity: persen 0–100 → 0–1, dibatasi, berlaku untuk teks/gambar/shape', () => {
  const { p, panelId } = setup();
  const q = setLayerOpacity(p, panelId, 'b', 35);
  expect(q.pages[0].scenes[0].panels[0].layers[1].opacity).toBe(0.35);
  expect(setLayerOpacity(p, panelId, 'b', 150).pages[0].scenes[0].panels[0].layers[1].opacity).toBe(1);
  expect(setLayerOpacity(p, panelId, 'b', -5).pages[0].scenes[0].panels[0].layers[1].opacity).toBe(0);
  expect(setLayerOpacity(p, panelId, 'b', Number.NaN)).toBe(p);
  let r = addLayer(p, panelId, { ...defaultText({ w: 1080, h: 1920 }), id: 't' });
  r = addLayer(r, panelId, { ...defaultShape('star', { w: 1080, h: 1920 }), id: 's' });
  r = setLayerOpacity(setLayerOpacity(r, panelId, 't', 50), panelId, 's', 20);
  const ls = r.pages[0].scenes[0].panels[0].layers;
  expect(ls.find((l) => l.id === 't')!.opacity).toBe(0.5);
  expect(ls.find((l) => l.id === 's')!.opacity).toBe(0.2);
});

test('replaceRef mengganti ref di layer & background (scene, page, cover)', async () => {
  const { replaceRef, addCover } = await import('../src/shared/model');
  let p = addCover(createProject('A', 'now'));
  const pn = p.pages[0].scenes[0].panels[0].id;
  p = addLayer(p, pn, { id: 'i', type: 'image', ref: 'clip:a.png', x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, flipX: false, flipY: false });
  p = { ...p, pages: [{ ...p.pages[0], background: { kind: 'asset', ref: 'clip:a.png', fit: 'cover' } }] };
  const q = replaceRef(p, 'clip:a.png', 'project:a.png');
  expect(JSON.stringify(q)).not.toContain('clip:a.png');
  expect(q.pages[0].scenes[0].panels[0].layers[0]).toMatchObject({ ref: 'project:a.png' });
});
