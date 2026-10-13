import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { agentLock, resetLive, setLiveTimings, subscribe, type LiveEvent } from '../src/server/live';
import { ops, ToolError } from '../src/server/mcp/ops';

let home: string;
const fixture = join(__dirname, 'fixtures', 'red.png'); // 20 x 40

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sb-ops-'));
  process.env.STORYBOARD_HOME = home;
  setLiveTimings({ ack: 50, idle: 200 });
});
afterEach(() => {
  resetLive();
  setLiveTimings({ ack: 3000, idle: 10000 });
});

const file = (slug: string) => join(home, 'projects', slug, 'project.json');
const raw = (slug: string) => readFileSync(file(slug), 'utf8');

async function fresh(name = 'Kipas') {
  const { slug } = await ops.createProject({ name });
  return slug;
}

test('createProject + getProject outline', async () => {
  const slug = await fresh();
  expect(slug).toBe('kipas');
  const o = await ops.getProject({ slug });
  expect(o.cover).toBeNull();
  expect(o.pages).toHaveLength(1);
  expect(o.pages[0].scenes.map((s) => s.number)).toEqual([1]);
  expect(o.pages[0].scenes[0].panels).toHaveLength(1);
});

test('addPage dengan 3 scene → penomoran 1..4; addScene di page penuh gagal tanpa mengubah file', async () => {
  const slug = await fresh();
  const r = await ops.addPage({ slug, scenes: 3 });
  expect(r.sceneIds).toHaveLength(3);
  const o = await ops.getProject({ slug });
  expect(o.pages.flatMap((p) => p.scenes.map((s) => s.number))).toEqual([1, 2, 3, 4]);
  const before = raw(slug);
  await expect(ops.addScene({ slug, pageId: r.pageId })).rejects.toThrow(new ToolError('Page sudah berisi 3 scene'));
  expect(raw(slug)).toBe(before);
});

test('addScene memberi nomor; removeScene terakhir di page ditolak; removePage terakhir ditolak', async () => {
  const slug = await fresh();
  const o = await ops.getProject({ slug });
  const pageId = o.pages[0].id;
  const r = await ops.addScene({ slug, pageId });
  expect(r.number).toBe(2);
  await ops.removeScene({ slug, sceneId: r.sceneId });
  await expect(ops.removeScene({ slug, sceneId: o.pages[0].scenes[0].id })).rejects.toThrow(ToolError);
  await expect(ops.removePage({ slug, pageId })).rejects.toThrow(ToolError);
});

test('updateScene: note/subtitle/split tersimpan; id salah → Scene tidak ditemukan', async () => {
  const slug = await fresh();
  const sceneId = (await ops.getProject({ slug })).pages[0].scenes[0].id;
  await ops.updateScene({ slug, sceneId, note: 'zoom in', subtitle: 'halo', split: true });
  const s = (await ops.getProject({ slug })).pages[0].scenes[0];
  expect(s).toMatchObject({ note: 'zoom in', subtitle: 'halo', split: true });
  expect(s.panels).toHaveLength(2);
  await expect(ops.updateScene({ slug, sceneId: 'nope', note: 'x' })).rejects.toThrow('Scene tidak ditemukan');
});

test('addLayer image: default tengah, 60% lebar, rasio asset; asset hilang → error', async () => {
  const slug = await fresh();
  mkdirSync(join(home, 'projects', slug, 'assets'), { recursive: true });
  copyFileSync(fixture, join(home, 'projects', slug, 'assets', 'dont.png'));
  const panelId = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].id;
  const { layerId } = await ops.addLayer({ slug, panelId, layer: { type: 'image', assetRef: 'project:dont.png' } });
  const l = JSON.parse(raw(slug)).pages[0].scenes[0].panels[0].layers.find((x: { id: string }) => x.id === layerId);
  expect(l).toMatchObject({ type: 'image', x: 540, y: 960, width: 648, height: 1296, opacity: 1 });
  await expect(ops.addLayer({ slug, panelId, layer: { type: 'image', assetRef: 'project:hilang.png' } })).rejects.toThrow('Asset tidak ditemukan: project:hilang.png');
});

test('addLayer text/shape/emoji, opacity 0–100, shape tak dikenal ditolak', async () => {
  const slug = await fresh();
  const panelId = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].id;
  await ops.addLayer({ slug, panelId, layer: { type: 'text', text: 'BRRR', opacity: 50 } });
  await ops.addLayer({ slug, panelId, layer: { type: 'shape', shape: 'star', x: 100, y: 200 } });
  await ops.addLayer({ slug, panelId, layer: { type: 'emoji', char: '🥶' } });
  const layers = JSON.parse(raw(slug)).pages[0].scenes[0].panels[0].layers;
  expect(layers.map((l: { type: string }) => l.type)).toEqual(['text', 'shape', 'emoji']);
  expect(layers[0]).toMatchObject({ text: 'BRRR', opacity: 0.5, font: 'Bangers' });
  expect(layers[1]).toMatchObject({ shape: 'star', x: 100, y: 200 });
  await expect(ops.addLayer({ slug, panelId, layer: { type: 'shape', shape: 'hexagon' } as never })).rejects.toThrow(ToolError);
});

test('updateLayer / reorderLayer / removeLayer', async () => {
  const slug = await fresh();
  const panelId = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].id;
  const a = (await ops.addLayer({ slug, panelId, layer: { type: 'text', text: 'A' } })).layerId;
  const b = (await ops.addLayer({ slug, panelId, layer: { type: 'text', text: 'B' } })).layerId;
  await ops.updateLayer({ slug, panelId, layerId: a, patch: { x: 10, opacity: 20 } });
  await ops.reorderLayer({ slug, panelId, layerId: a, to: 'top' });
  let layers = JSON.parse(raw(slug)).pages[0].scenes[0].panels[0].layers;
  expect(layers.map((l: { id: string }) => l.id)).toEqual([b, a]);
  expect(layers[1]).toMatchObject({ x: 10, opacity: 0.2 });
  await ops.removeLayer({ slug, panelId, layerId: b });
  layers = JSON.parse(raw(slug)).pages[0].scenes[0].panels[0].layers;
  expect(layers.map((l: { id: string }) => l.id)).toEqual([a]);
  await expect(ops.updateLayer({ slug, panelId, layerId: 'zzz', patch: { x: 1 } })).rejects.toThrow('Layer tidak ditemukan');
});

test('setBackground: page color, default asset, reset page; color+asset sekaligus ditolak', async () => {
  const slug = await fresh();
  mkdirSync(join(home, 'library'), { recursive: true });
  copyFileSync(fixture, join(home, 'library', 'bg.png'));
  const pageId = (await ops.getProject({ slug })).pages[0].id;
  await ops.setBackground({ slug, target: { pageId }, color: '#000000' });
  expect(JSON.parse(raw(slug)).pages[0].background).toEqual({ kind: 'color', color: '#000000' });
  await ops.setBackground({ slug, target: 'default', assetRef: 'global:bg.png' });
  expect(JSON.parse(raw(slug)).pageBackground).toEqual({ kind: 'asset', ref: 'global:bg.png', fit: 'cover' });
  await ops.setBackground({ slug, target: { pageId }, reset: true });
  expect(JSON.parse(raw(slug)).pages[0].background).toBeNull();
  await expect(ops.setBackground({ slug, target: { pageId }, color: '#fff', assetRef: 'global:bg.png' })).rejects.toThrow(ToolError);
});

test('setCover on/off', async () => {
  const slug = await fresh();
  const on = await ops.setCover({ slug, enabled: true, title: 'VISUAL ASLI' });
  expect(typeof on.coverPanelId).toBe('string');
  expect((await ops.getProject({ slug })).cover?.title).toBe('VISUAL ASLI');
  expect((await ops.setCover({ slug, enabled: false })).coverPanelId).toBeNull();
});

test('mutasi mengunci project + publish project; finishEditing melepas', async () => {
  const slug = await fresh();
  const got: LiveEvent[] = [];
  const sub = subscribe(slug, (e) => got.push(e));
  const sceneId = (await ops.getProject({ slug })).pages[0].scenes[0].id;
  expect(agentLock.state(slug)).toBe('none'); // reads don't lock
  await ops.updateScene({ slug, sceneId, subtitle: 'x' });
  expect(agentLock.state(slug)).toBe('active');
  const proj = got.find((e) => e.type === 'project');
  expect(proj && proj.type === 'project' && proj.project.pages[0].scenes[0].subtitle).toBe('x');
  await ops.setStoryline({ slug, text: 'cerita' });
  expect(got.some((e) => e.type === 'storyline' && e.text === 'cerita')).toBe(true);
  expect((await ops.getStoryline({ slug })).text).toBe('cerita');
  await ops.finishEditing({ slug });
  expect(agentLock.state(slug)).toBe('none');
  sub.close();
});

test('listAssets & listProjects; slug tidak ada → Project tidak ditemukan', async () => {
  const slug = await fresh();
  copyFileSync(fixture, join(home, 'projects', slug, 'assets', 'a.png'));
  const a = await ops.listAssets({ slug });
  expect(a.project.map((x) => x.ref)).toEqual(['project:a.png']);
  expect((await ops.listProjects({})).items.map((x) => x.slug)).toEqual([slug]);
  await expect(ops.getProject({ slug: 'tidak-ada' })).rejects.toThrow('Project tidak ditemukan: tidak-ada');
});
