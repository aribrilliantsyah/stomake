import { expect, test } from 'vitest';
import { createProject } from '../src/shared/model';
import { parseProject } from '../src/shared/schema';
import { migrateProject } from '../src/shared/migrate';

const base = () => createProject('A', '2026-10-13T00:00:00Z');
function v1() {
  const p = { ...base(), version: 1 } as Record<string, unknown>;
  delete p.cover;
  return p;
}
const withLayers = (p: ReturnType<typeof base>, layers: unknown[]) => {
  const s = p.pages[0].scenes[0];
  return { ...p, pages: [{ ...p.pages[0], scenes: [{ ...s, panels: [{ ...s.panels[0], layers }] }] }] };
};
const L = { x: 1, y: 1, rotation: 0, opacity: 1 };

test('createProject v2 dengan cover null', () => {
  expect(base().version).toBe(2);
  expect(base().cover).toBeNull();
});

test('v1 dimigrasi ke v2 dengan cover null', () => {
  const raw = v1();
  const p = parseProject(raw);
  expect(p.version).toBe(2);
  expect(p.cover).toBeNull();
  expect(p.pages).toEqual(raw.pages);
});

test('migrateProject tidak mengubah v2 dan tidak memutasi input', () => {
  const p = base();
  expect(migrateProject(p)).toEqual(p);
  const raw = v1();
  migrateProject(raw);
  expect(raw.version).toBe(1);
});

test('arrow layer lama tetap valid', () => {
  const p = { ...withLayers(base(), [{ ...L, id: 'a', type: 'arrow', points: [0, 0, 0, -300], strokeWidth: 18, color: '#000' }]), version: 1 } as Record<string, unknown>;
  delete p.cover;
  expect(() => parseProject(p)).not.toThrow();
});

test('shape layer valid; shape kind asing ditolak', () => {
  const shape = { ...L, id: 's', type: 'shape', shape: 'star', width: 400, height: 400, fill: null, stroke: '#000000', strokeWidth: 12, dash: false };
  expect(() => parseProject(withLayers(base(), [shape]))).not.toThrow();
  expect(() => parseProject(withLayers(base(), [{ ...shape, shape: 'hexagon' }]))).toThrow();
});

test('text font string bebas diterima', () => {
  for (const font of ['Poppins', 'Ubuntu Mono']) {
    const t = { ...L, id: 't', type: 'text', text: 'X', font, fontSize: 100, fill: '#000', stroke: null, strokeWidth: 0 };
    expect(() => parseProject(withLayers(base(), [t]))).not.toThrow();
  }
});

test('cover.panel dengan layer diterima; cover tanpa title ditolak', () => {
  const panel = { id: 'cp', background: { kind: 'color', color: '#FFFFFF' }, layers: [{ ...L, id: 'e', type: 'emoji', char: '🔥', size: 200 }] };
  expect(parseProject({ ...base(), cover: { id: 'c', title: 'VISUAL ASLI', panel } }).cover?.panel.layers).toHaveLength(1);
  expect(() => parseProject({ ...base(), cover: { id: 'c', panel } })).toThrow();
});
