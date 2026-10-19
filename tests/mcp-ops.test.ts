import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

test('id salah tidak mengunci editor (validasi sebelum lock)', async () => {
  const slug = await fresh();
  await expect(ops.updateScene({ slug, sceneId: 'nope', note: 'x' })).rejects.toThrow('Scene tidak ditemukan');
  expect(agentLock.state(slug)).toBe('none');
});

test('update_layer: field yang tidak berlaku untuk jenis layer ditolak; teks kosong ditolak', async () => {
  const slug = await fresh();
  const panelId = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].id;
  const { layerId } = await ops.addLayer({ slug, panelId, layer: { type: 'text', text: 'A' } });
  await expect(ops.updateLayer({ slug, panelId, layerId, patch: { char: '🔥' } })).rejects.toThrow('Properti tidak berlaku untuk layer text: char');
  await expect(ops.updateLayer({ slug, panelId, layerId, patch: { text: '' } })).rejects.toThrow(ToolError);
  await expect(ops.updateLayer({ slug, panelId, layerId, patch: { fill: null } })).rejects.toThrow(ToolError);
});

test('set_background reset + color sekaligus ditolak', async () => {
  const slug = await fresh();
  const pageId = (await ops.getProject({ slug })).pages[0].id;
  await expect(ops.setBackground({ slug, target: { pageId }, reset: true, color: '#000000' })).rejects.toThrow('reset tidak bisa digabung');
});

test('finish_editing saat tool lain menunggu ack: tool itu tetap selesai di bawah kunci, lalu kunci lepas', async () => {
  const slug = await fresh();
  const sceneId = (await ops.getProject({ slug })).pages[0].scenes[0].id;
  const sub = subscribe(slug, () => undefined); // never acks → waits ACK (50ms)
  const pending = ops.updateScene({ slug, sceneId, subtitle: 'akhir' });
  await new Promise((r) => setTimeout(r, 5));
  await ops.finishEditing({ slug });
  await pending;
  await new Promise((r) => setTimeout(r, 5));
  expect(agentLock.state(slug)).toBe('none');
  expect(JSON.parse(raw(slug)).pages[0].scenes[0].subtitle).toBe('akhir');
  sub.close();
});

test('text wrap: width menyalakan kotak lipat dengan align default center; width null mematikannya', async () => {
  const slug = await fresh();
  const panelId = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].id;
  const { layerId } = await ops.addLayer({ slug, panelId, layer: { type: 'text', text: 'kalimat panjang sekali', width: 860, lineHeight: 1.2 } });
  const read = () => JSON.parse(raw(slug)).pages[0].scenes[0].panels[0].layers[0];
  expect(read()).toMatchObject({ width: 860, align: 'center', lineHeight: 1.2 });

  await ops.updateLayer({ slug, panelId, layerId, patch: { align: 'left' } });
  expect(read().align).toBe('left');

  await ops.updateLayer({ slug, panelId, layerId, patch: { width: null } });
  const off = read();
  expect(off.width).toBeUndefined();
  expect(off.align).toBeUndefined();
  expect(off.lineHeight).toBeUndefined();

  await expect(ops.updateLayer({ slug, panelId, layerId, patch: { align: 'right' } })).rejects.toThrow('align/lineHeight butuh width');
});

test('add_layers menulis semua layer berurutan dalam satu penyimpanan', async () => {
  const slug = await fresh();
  const panelId = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].id;
  const events: LiveEvent[] = [];
  subscribe(slug, (e) => events.push(e));
  const { layerIds } = await ops.addLayers({
    slug,
    panelId,
    layers: [
      { type: 'shape', shape: 'bubble', y: 400 },
      { type: 'text', text: 'KOK BISA?', y: 400 },
      { type: 'emoji', char: '🤔', y: 900 },
    ],
  });
  expect(layerIds).toHaveLength(3);
  const layers = JSON.parse(raw(slug)).pages[0].scenes[0].panels[0].layers;
  expect(layers.map((l: { type: string }) => l.type)).toEqual(['shape', 'text', 'emoji']);
  expect(events.filter((e) => e.type === 'project')).toHaveLength(1);
});

test('group_layers menandai anggota dengan groupId yang sama; ungroup melepasnya; <2 layer ditolak', async () => {
  const slug = await fresh();
  const panelId = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].id;
  const { layerIds } = await ops.addLayers({ slug, panelId, layers: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] });
  const { groupId } = await ops.groupLayers({ slug, panelId, layerIds });
  const groups = () => JSON.parse(raw(slug)).pages[0].scenes[0].panels[0].layers.map((l: { groupId?: string }) => l.groupId);
  expect(groups()).toEqual([groupId, groupId]);

  await ops.groupLayers({ slug, panelId, layerIds: [layerIds[0]], ungroup: true });
  expect(groups()).toEqual([undefined, undefined]);

  await expect(ops.groupLayers({ slug, panelId, layerIds: [layerIds[0]] })).rejects.toThrow('minimal 2 layer');
  await expect(ops.groupLayers({ slug, panelId, layerIds: ['nope'] })).rejects.toThrow('Layer tidak ditemukan');
});

test('check_storyboard: asset hilang = error, teks kecil / di luar frame / semua bg polos = warning', async () => {
  const slug = await fresh();
  const o = await ops.getProject({ slug });
  const panelId = o.pages[0].scenes[0].panels[0].id;
  await ops.updateScene({ slug, sceneId: o.pages[0].scenes[0].id, subtitle: 'kenapa kipas berdebu' });
  await ops.addLayers({
    slug,
    panelId,
    layers: [
      { type: 'text', text: 'kecil', fontSize: 20 },
      { type: 'text', text: 'kalimat yang jauh lebih panjang dari dua puluh empat karakter' },
      { type: 'emoji', char: '🔥', x: 2000, y: 100 },
    ],
  });
  const r = await ops.checkStoryboard({ slug });
  const msgs = r.issues.map((x) => x.message);
  expect(r.ok).toBe(true);
  expect(msgs.some((m) => m.includes('terlalu kecil'))).toBe(true);
  expect(msgs.some((m) => m.includes('tanpa width'))).toBe(true);
  expect(msgs.some((m) => m.includes('di luar frame'))).toBe(true);

  // the only frame still sits on the default white panel colour
  await ops.addPage({ slug, scenes: 2 });
  expect((await ops.checkStoryboard({ slug })).issues.some((x) => x.message.includes('background warna polos'))).toBe(true);

  // a layer pointing at a file that was never uploaded is a hard error
  const p = JSON.parse(raw(slug));
  p.pages[0].scenes[0].panels[0].layers.push({ id: 'ghost', type: 'image', ref: 'project:hilang.png', x: 540, y: 960, width: 10, height: 10, rotation: 0, opacity: 1, flipX: false, flipY: false });
  writeFileSync(file(slug), JSON.stringify(p));
  const bad = await ops.checkStoryboard({ slug });
  expect(bad.ok).toBe(false);
  expect(bad.issues.some((x) => x.level === 'error' && x.message.includes('Asset hilang'))).toBe(true);
});

test('list_fonts hanya memuat font bawaan aplikasi', async () => {
  const r = await ops.listFonts();
  expect(r.default).toBe('Bangers');
  expect(r.fonts).toContain('Luckiest Guy');
  expect(r.fonts).not.toContain('Comic Sans MS');
});
