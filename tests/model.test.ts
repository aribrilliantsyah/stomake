import { describe, expect, test } from 'vitest';
import {
  addSceneAfter,
  createProject,
  duplicateScene,
  findPanel,
  flatScenes,
  moveScene,
  removeScene,
  sceneNumber,
  setSplit,
  updateScene,
} from '../src/shared/model';
import type { Project } from '../src/shared/types';

const P = () => createProject('Selimut Darurat', '2026-10-12T00:00:00Z');

function withScenes(n: number): Project {
  let p = P();
  let id = p.pages[0].scenes[0].id;
  for (let i = 1; i < n; i++) ({ project: p, sceneId: id } = addSceneAfter(p, id));
  return p;
}
const lens = (p: Project) => p.pages.map((pg) => pg.scenes.length);
const idAt = (p: Project, n: number) => flatScenes(p)[n - 1].scene.id;

describe('model', () => {
  test('project baru: 1 page 1 scene, bg default', () => {
    const p = P();
    expect(p.name).toBe('Selimut Darurat');
    expect(p.version).toBe(1);
    expect(p.pages).toHaveLength(1);
    expect(p.pages[0].scenes).toHaveLength(1);
    expect(p.pages[0].background).toBeNull();
    expect(p.pageBackground).toEqual({ kind: 'color', color: '#D4BFB3' });
    const s = p.pages[0].scenes[0];
    expect(s).toMatchObject({ note: '', subtitle: '', split: false });
    expect(s.panels).toHaveLength(1);
    expect(s.panels[0].background).toEqual({ kind: 'color', color: '#FFFFFF' });
    expect(s.panels[0].layers).toEqual([]);
  });

  test('scene ke-4 membuat page baru, nomor berlanjut', () => {
    let p = P();
    let id = p.pages[0].scenes[0].id;
    for (let i = 0; i < 3; i++) ({ project: p, sceneId: id } = addSceneAfter(p, id));
    expect(lens(p)).toEqual([3, 1]);
    expect(sceneNumber(p, id)).toBe(4);
    expect(flatScenes(p).map((s) => s.pageIndex)).toEqual([0, 0, 0, 1]);
  });

  test('add di page penuh yang bukan terakhir menyisipkan page setelahnya', () => {
    const p6 = withScenes(6);
    expect(lens(p6)).toEqual([3, 3]);
    const oldThird = idAt(p6, 3);
    const { project: p, sceneId } = addSceneAfter(p6, idAt(p6, 2));
    expect(lens(p)).toEqual([3, 1, 3]);
    expect(sceneNumber(p, sceneId)).toBe(3);
    expect(sceneNumber(p, oldThird)).toBe(4);
    expect(flatScenes(p).map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('hapus scene tengah: nomor bergeser, page kosong hilang', () => {
    const p4 = withScenes(4);
    expect(lens(removeScene(p4, idAt(p4, 4)))).toEqual([3]);
    const p6 = withScenes(6);
    const fifth = idAt(p6, 5);
    const q = removeScene(p6, idAt(p6, 2));
    expect(lens(q)).toEqual([2, 3]);
    expect(flatScenes(q).map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
    expect(sceneNumber(q, fifth)).toBe(4);
  });

  test('hapus satu-satunya scene tidak menghapus page terakhir', () => {
    const p = P();
    const q = removeScene(p, p.pages[0].scenes[0].id);
    expect(q.pages).toHaveLength(1);
    expect(q.pages[0].scenes).toHaveLength(1);
  });

  test('duplicateScene menyalin layer dengan id baru, tepat setelah sumber', () => {
    let p = withScenes(2);
    const src = idAt(p, 1);
    const panelId = p.pages[0].scenes[0].panels[0].id;
    p = updateScene(p, src, { note: 'foil muncul', subtitle: 'kenapa' });
    p = {
      ...p,
      pages: p.pages.map((pg) => ({
        ...pg,
        scenes: pg.scenes.map((s) =>
          s.id !== src
            ? s
            : {
                ...s,
                panels: s.panels.map((pn) => ({
                  ...pn,
                  layers: [{ id: 'L1', type: 'emoji', char: '🔥', size: 200, x: 1, y: 2, rotation: 0, opacity: 1 }],
                })),
              },
        ),
      })),
    } as Project;
    const { project: q, sceneId } = duplicateScene(p, src);
    expect(sceneNumber(q, sceneId)).toBe(2);
    const dup = flatScenes(q)[1].scene;
    expect(dup.note).toBe('foil muncul');
    expect(dup.subtitle).toBe('kenapa');
    expect(dup.panels[0].id).not.toBe(panelId);
    expect(dup.panels[0].layers[0].id).not.toBe('L1');
    expect(dup.panels[0].layers[0]).toMatchObject({ type: 'emoji', char: '🔥', x: 1, y: 2 });
    expect(lens(q)).toEqual([3]);
  });

  test('moveScene lintas page', () => {
    const p4 = withScenes(4);
    const third = idAt(p4, 3);
    const q = moveScene(p4, third, 1);
    expect(sceneNumber(q, third)).toBe(4);
    expect(lens(q)).toEqual([3, 1]);
    const back = moveScene(q, third, -1);
    expect(sceneNumber(back, third)).toBe(3);
    // batas: scene 1 tidak bisa naik
    expect(moveScene(p4, idAt(p4, 1), -1)).toEqual(p4);
  });

  test('setSplit true → 2 panel, panel kedua salinan panel pertama; false → 1 panel', () => {
    const p = P();
    const s = p.pages[0].scenes[0];
    const q = setSplit(p, s.id, true);
    const qs = q.pages[0].scenes[0];
    expect(qs.split).toBe(true);
    expect(qs.panels).toHaveLength(2);
    expect(qs.panels[1].id).not.toBe(qs.panels[0].id);
    expect(qs.panels[1].background).toEqual(qs.panels[0].background);
    const r = setSplit(q, s.id, false);
    expect(r.pages[0].scenes[0].panels).toHaveLength(1);
    expect(r.pages[0].scenes[0].panels[0].id).toBe(qs.panels[0].id);
    expect(findPanel(r, qs.panels[0].id)?.scene.id).toBe(s.id);
  });
});
