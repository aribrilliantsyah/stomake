import { expect, test } from 'vitest';
import { createProject } from '../src/shared/model';
import { parseProject } from '../src/shared/schema';

const P = () => createProject('X', '2026-10-12T00:00:00Z');

test('parseProject menerima createProject', () => {
  expect(() => parseProject(P())).not.toThrow();
});

test('menolak page dengan 4 scene', () => {
  const p = P();
  const s = p.pages[0].scenes[0];
  const bad = { ...p, pages: [{ ...p.pages[0], scenes: [s, s, s, s] }] };
  expect(() => parseProject(bad)).toThrow();
});

test('menolak page tanpa scene', () => {
  const p = P();
  expect(() => parseProject({ ...p, pages: [{ ...p.pages[0], scenes: [] }] })).toThrow();
});

test('menolak split=true dengan 1 panel', () => {
  const p = P();
  const s = { ...p.pages[0].scenes[0], split: true };
  expect(() => parseProject({ ...p, pages: [{ ...p.pages[0], scenes: [s] }] })).toThrow();
});

test('menolak ref asset tanpa prefix global:/project:', () => {
  const p = P();
  const bad = { ...p, pageBackground: { kind: 'asset', ref: 'bg.jpg', fit: 'cover' } };
  expect(() => parseProject(bad)).toThrow();
  const ok = { ...p, pageBackground: { kind: 'asset', ref: 'project:bg gunung.jpg', fit: 'cover' } };
  expect(() => parseProject(ok)).not.toThrow();
});

test('menerima semua jenis layer', () => {
  const p = P();
  const layers = [
    { id: 'a', type: 'image', ref: 'global:dont .png', x: 1, y: 1, rotation: 0, opacity: 1, width: 10, height: 10, flipX: false, flipY: true },
    { id: 'b', type: 'text', text: 'WISTAR', font: 'Bangers', fontSize: 100, fill: '#000', stroke: '#fff', strokeWidth: 8, x: 1, y: 1, rotation: 0, opacity: 1 },
    { id: 'c', type: 'arrow', points: [0, 0, 0, -300], strokeWidth: 18, color: '#000', x: 1, y: 1, rotation: 0, opacity: 1 },
    { id: 'd', type: 'emoji', char: '🔥', size: 200, x: 1, y: 1, rotation: 0, opacity: 1 },
  ];
  const s = { ...p.pages[0].scenes[0], panels: [{ ...p.pages[0].scenes[0].panels[0], layers }] };
  expect(() => parseProject({ ...p, pages: [{ ...p.pages[0], scenes: [s] }] })).not.toThrow();
});
