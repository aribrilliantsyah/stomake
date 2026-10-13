import { describe, expect, test } from 'vitest';
import {
  addPage,
  addSceneInPage,
  canRemoveScene,
  createProject,
  duplicatePage,
  duplicateScene,
  findPanel,
  flatScenes,
  movePage,
  moveScene,
  pageOf,
  removePage,
  removeScene,
  sceneNumber,
  setSplit,
  updateScene,
  withPageSizes,
  addCover,
  removeCover,
  updateCover,
  updatePanel,
} from '../src/shared/model';
import { COVER } from '../src/shared/layout';
import type { Project } from '../src/shared/types';

const P = () => createProject('Selimut Darurat', '2026-10-12T00:00:00Z');
const lens = (p: Project) => p.pages.map((pg) => pg.scenes.length);
const nums = (p: Project) => flatScenes(p).map((s) => s.number);
const idAt = (p: Project, n: number) => flatScenes(p)[n - 1].scene.id;

describe('model dasar', () => {
  test('project baru: 1 page 1 scene, bg default, v2', () => {
    const p = P();
    expect(p.version).toBe(2);
    expect(p.pages).toHaveLength(1);
    expect(p.pages[0].scenes).toHaveLength(1);
    expect(p.pages[0].background).toBeNull();
    expect(p.pageBackground).toEqual({ kind: 'color', color: '#D4BFB3' });
    const s = p.pages[0].scenes[0];
    expect(s).toMatchObject({ note: '', subtitle: '', split: false });
    expect(s.panels[0].background).toEqual({ kind: 'color', color: '#FFFFFF' });
  });

  test('withPageSizes (helper test/demo) membuat page sesuai ukuran', () => {
    const p = withPageSizes(P(), [1, 3, 2]);
    expect(lens(p)).toEqual([1, 3, 2]);
    expect(nums(p)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('setSplit true → 2 panel salinan; false → 1 panel', () => {
    const p = P();
    const s = p.pages[0].scenes[0];
    const q = setSplit(p, s.id, true);
    const qs = q.pages[0].scenes[0];
    expect(qs.panels).toHaveLength(2);
    expect(qs.panels[1].id).not.toBe(qs.panels[0].id);
    const r = setSplit(q, s.id, false);
    expect(r.pages[0].scenes[0].panels.map((x) => x.id)).toEqual([qs.panels[0].id]);
    expect(findPanel(r, qs.panels[0].id)?.scene?.id).toBe(s.id);
  });
});

describe('operasi page gaya PPT', () => {
  test('+Scene di page berisi 3 → null', () => {
    const p = withPageSizes(P(), [3]);
    expect(addSceneInPage(p, p.pages[0].id, null)).toBeNull();
  });

  test('+Scene menyisipkan setelah scene tertentu atau di akhir page', () => {
    const p = withPageSizes(P(), [2, 1]);
    const first = idAt(p, 1);
    const r = addSceneInPage(p, p.pages[0].id, first)!;
    expect(lens(r.project)).toEqual([3, 1]);
    expect(sceneNumber(r.project, r.sceneId)).toBe(2);
    const r2 = addSceneInPage(p, p.pages[1].id, null)!;
    expect(lens(r2.project)).toEqual([2, 2]);
    expect(sceneNumber(r2.project, r2.sceneId)).toBe(4);
  });

  test('tidak ada reflow: P1[1], P2[2,3] + scene di P2 → P1[1], P2[2,3,4]', () => {
    const p = withPageSizes(P(), [1, 2]);
    const r = addSceneInPage(p, p.pages[1].id, null)!;
    expect(lens(r.project)).toEqual([1, 3]);
  });

  test('addPage setelah P1 → page baru di index 1 dengan 1 scene, nomor berikutnya bergeser', () => {
    const p = withPageSizes(P(), [1, 2]);
    const old2 = idAt(p, 2);
    const r = addPage(p, p.pages[0].id);
    expect(lens(r.project)).toEqual([1, 1, 2]);
    expect(r.project.pages[1].id).toBe(r.pageId);
    expect(r.project.pages[1].background).toBeNull();
    expect(sceneNumber(r.project, r.sceneId)).toBe(2);
    expect(sceneNumber(r.project, old2)).toBe(3);
    expect(lens(addPage(p, null).project)).toEqual([1, 1, 2]);
    expect(addPage(p, null).project.pages[0].scenes).toHaveLength(1);
  });

  test('removeScene scene satu-satunya di page = no-op; canRemoveScene false', () => {
    const p = withPageSizes(P(), [1, 2]);
    expect(canRemoveScene(p, idAt(p, 1))).toBe(false);
    expect(removeScene(p, idAt(p, 1))).toBe(p);
    expect(canRemoveScene(p, idAt(p, 2))).toBe(true);
    const q = removeScene(p, idAt(p, 2));
    expect(lens(q)).toEqual([1, 1]);
  });

  test('removePage menghapus page beserta scene, nomor bergeser; page terakhir tidak bisa dihapus', () => {
    const p = withPageSizes(P(), [1, 3, 2]);
    const fifth = idAt(p, 5);
    const q = removePage(p, p.pages[1].id);
    expect(lens(q)).toEqual([1, 2]);
    expect(sceneNumber(q, fifth)).toBe(2);
    const one = P();
    expect(removePage(one, one.pages[0].id)).toBe(one);
  });

  test('movePage & moveScene di ujung = no-op; moveScene hanya dalam page', () => {
    const p = withPageSizes(P(), [2, 1]);
    expect(movePage(p, p.pages[0].id, -1)).toBe(p);
    const m = movePage(p, p.pages[0].id, 1);
    expect(lens(m)).toEqual([1, 2]);
    expect(moveScene(p, idAt(p, 2), 1)).toBe(p);
    const s = moveScene(p, idAt(p, 1), 1);
    expect(flatScenes(s)[1].scene.id).toBe(idAt(p, 1));
    expect(lens(s)).toEqual([2, 1]);
  });

  test('duplicatePage: id baru semua, isi sama, disisipkan setelah sumber', () => {
    let p = withPageSizes(P(), [2, 1]);
    p = updateScene(p, idAt(p, 1), { subtitle: 'kenapa' });
    const r = duplicatePage(p, p.pages[0].id);
    expect(lens(r.project)).toEqual([2, 2, 1]);
    const [a, b] = [r.project.pages[0], r.project.pages[1]];
    expect(b.id).toBe(r.pageId);
    expect(b.id).not.toBe(a.id);
    expect(b.scenes[0].subtitle).toBe('kenapa');
    expect(b.scenes[0].id).not.toBe(a.scenes[0].id);
    expect(b.scenes[0].panels[0].id).not.toBe(a.scenes[0].panels[0].id);
  });

  test('duplicateScene: setelah sumber; page penuh → tidak berubah', () => {
    const p = withPageSizes(P(), [2]);
    const r = duplicateScene(p, idAt(p, 1));
    expect(lens(r.project)).toEqual([3]);
    expect(sceneNumber(r.project, r.sceneId)).toBe(2);
    const full = withPageSizes(P(), [3]);
    const f = duplicateScene(full, idAt(full, 1));
    expect(f.project).toBe(full);
    expect(f.sceneId).toBe(idAt(full, 1));
  });

  test('pageOf', () => {
    const p = withPageSizes(P(), [1, 2]);
    expect(pageOf(p, idAt(p, 3))?.id).toBe(p.pages[1].id);
    expect(pageOf(p, 'nope')).toBeNull();
  });
});

describe('cover', () => {
  test('addCover: judul VISUAL ASLI, panel putih kosong, tidak mengubah nomor scene; idempoten', () => {
    const p = withPageSizes(P(), [2]);
    const q = addCover(p);
    expect(q.cover).toMatchObject({ title: 'VISUAL ASLI', panel: { background: { kind: 'color', color: '#FFFFFF' }, layers: [] } });
    expect(nums(q)).toEqual([1, 2]);
    expect(addCover(q)).toBe(q);
    expect(removeCover(q).cover).toBeNull();
    expect(updateCover(q, { title: 'REFERENSI' }).cover?.title).toBe('REFERENSI');
    expect(updateCover(p, { title: 'x' })).toBe(p);
  });

  test('findPanel/updatePanel bekerja pada cover panel', () => {
    const q = addCover(P());
    const id = q.cover!.panel.id;
    expect(findPanel(q, id)).toEqual({ panel: q.cover!.panel, scene: null });
    const r = updatePanel(q, id, (pn) => ({ ...pn, background: { kind: 'color', color: '#000000' } }));
    expect(r.cover!.panel.background).toEqual({ kind: 'color', color: '#000000' });
  });

  test('COVER layout di tengah', () => {
    expect(COVER).toEqual({ titleY: 23, titleSize: 30, x: 282.375, y: 128 });
  });
});
