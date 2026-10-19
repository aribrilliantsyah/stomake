import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageSize } from 'image-size';
import { afterAll, afterEach, beforeEach, expect, test } from 'vitest';
import { closeBrowser } from '../src/server/export';
import { svgToPng } from '../src/server/svgAsset';
import { agentLock, resetLive, subscribe, type LiveEvent } from '../src/server/live';
import { ops, ToolError } from '../src/server/mcp/ops';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sb-svg-'));
  process.env.STORYBOARD_HOME = home;
});
afterEach(() => resetLive());
afterAll(() => closeBrowser());

const ICE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 340"><path d="M40 70 L250 30 L330 120 L310 300 L90 320 L20 230 Z" fill="#e9f7ff" stroke="#8ccbe6" stroke-width="10"/></svg>`;
const assetsDir = (slug: string) => join(home, 'projects', slug, 'assets');

test('SVG jadi PNG transparan di Asset project, bisa langsung dipakai add_layer; editor diberi tahu', async () => {
  const { slug } = await ops.createProject({ name: 'Es' });
  const events: LiveEvent[] = [];
  subscribe(slug, (e) => events.push(e));

  const r = await ops.addSvgAsset({ slug, name: 'es batu', svg: ICE, width: 720 });
  expect(r).toEqual({ assetRef: 'project:es batu.png', name: 'es batu.png', width: 720, height: 680 });
  const file = join(assetsDir(slug), 'es batu.png');
  const png = readFileSync(file);
  expect(imageSize(png)).toMatchObject({ width: 720, height: 680, type: 'png' });
  // corners are outside the polygon: transparent, not painted white
  expect(png.subarray(25, 26)[0]).toBe(6); // PNG colour type 6 = RGBA
  expect(events).toContainEqual({ type: 'assets' });
  // an asset write doesn't lock the user's editor
  expect(agentLock.state(slug)).toBe('none');

  const panelId = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].id;
  const { layerId } = await ops.addLayer({ slug, panelId, layer: { type: 'image', assetRef: r.assetRef } });
  const layer = JSON.parse(readFileSync(join(home, 'projects', slug, 'project.json'), 'utf8')).pages[0].scenes[0].panels[0].layers.find((l: { id: string }) => l.id === layerId);
  expect(layer).toMatchObject({ ref: 'project:es batu.png', width: 648, height: 612 });
});

test('nama sama tidak menimpa; .png/.svg di nama tidak dobel; ukuran default dari viewBox', async () => {
  const { slug } = await ops.createProject({ name: 'Es' });
  const a = await ops.addSvgAsset({ slug, name: 'gelas.svg', svg: ICE });
  const b = await ops.addSvgAsset({ slug, name: 'gelas.png', svg: ICE });
  expect([a.name, b.name]).toEqual(['gelas.png', 'gelas (2).png']);
  expect([a.width, a.height]).toEqual([1024, 967]);
});

test('ukuran besar dibatasi 2048 px di sisi terpanjang', async () => {
  const { slug } = await ops.createProject({ name: 'Es' });
  const r = await ops.addSvgAsset({ slug, name: 'lebar', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="9000" height="3000"><rect width="9000" height="3000" fill="red"/></svg>' });
  expect([r.width, r.height]).toEqual([2048, 683]);
});

test('SVG tidak pernah mengakses jaringan (gambar, script, iframe di dalam SVG diabaikan)', async () => {
  let hits = 0;
  const srv = createServer((_q, res) => {
    hits++;
    res.end('x');
  }).listen(0);
  const port = (srv.address() as AddressInfo).port;
  const u = `http://127.0.0.1:${port}`;
  const evil = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <script>fetch('${u}/s')</script><image href="${u}/i.png" width="100" height="100"/>
    <foreignObject width="100" height="100"><iframe xmlns="http://www.w3.org/1999/xhtml" src="${u}/f"/></foreignObject>
    <rect width="50" height="50" fill="green"/></svg>`;
  // the renderer itself, not addSvgAsset: that tool rejects <foreignObject> before this point
  // resolves only after the render context is closed: nothing can still be in flight
  await svgToPng(evil);
  srv.close();
  expect(hits).toBe(0);
});

test('input buruk → pesan jelas, tidak ada file tersimpan', async () => {
  const { slug } = await ops.createProject({ name: 'Es' });
  const cases: [Parameters<typeof ops.addSvgAsset>[0], string][] = [
    [{ slug, name: 'x', svg: 'halo' }, 'bukan SVG'],
    [{ slug, name: 'x', svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L' }, 'tidak bisa dirender'],
    [{ slug, name: 'x', svg: `<svg>${'a'.repeat(1_100_000)}</svg>` }, 'terlalu besar'],
    [{ slug, name: '../luar', svg: ICE }, 'Nama tidak valid'],
    [{ slug: 'tidak-ada', name: 'x', svg: ICE }, 'Project tidak ditemukan'],
  ];
  for (const [input, msg] of cases) {
    const p = ops.addSvgAsset(input);
    await expect(p).rejects.toThrow(ToolError);
    await expect(p).rejects.toThrow(msg);
  }
  expect(existsSync(assetsDir(slug)) ? readdirSync(assetsDir(slug)) : []).toEqual([]);
});

test('SVG dengan teks ditolak: teks harus jadi layer text, bukan gambar', async () => {
  const { slug } = await ops.createProject({ name: 'Es' });
  for (const svg of [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50">JUDUL</text></svg>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><foreignObject width="100" height="100"><p xmlns="http://www.w3.org/1999/xhtml">JUDUL</p></foreignObject></svg>`,
  ]) {
    await expect(ops.addSvgAsset({ slug, name: 'judul', svg })).rejects.toThrow('add_layer');
  }
  expect(existsSync(assetsDir(slug)) ? readdirSync(assetsDir(slug)) : []).toEqual([]);
});

test('add_pattern_asset: background bermotif jadi PNG ukuran panel dan langsung bisa dipakai set_background', async () => {
  const { slug } = await ops.createProject({ name: 'Es' });
  const r = await ops.addPatternAsset({ slug, name: 'bg grid', kind: 'grid', color: '#F3EDE4', ink: '#1F1E1B', cell: 120, vignette: true });
  expect(r).toMatchObject({ assetRef: 'project:bg grid.png', width: 1080, height: 1920 });
  expect(imageSize(readFileSync(join(assetsDir(slug), 'bg grid.png')))).toMatchObject({ width: 1080, height: 1920 });

  const panelId = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].id;
  await ops.setBackground({ slug, target: { panelId }, assetRef: r.assetRef });
  const bg = (await ops.getProject({ slug })).pages[0].scenes[0].panels[0].background;
  expect(bg).toEqual({ kind: 'asset', ref: 'project:bg grid.png', fit: 'cover' });
});

test('add_pattern_asset: panel split memakai tinggi 960 dan gradien dua warna', async () => {
  const { slug } = await ops.createProject({ name: 'Es' });
  const r = await ops.addPatternAsset({ slug, name: 'bg rays', kind: 'rays', color: '#FFD966', color2: '#E8663C', height: 960, inkOpacity: 0.3 });
  expect([r.width, r.height]).toEqual([1080, 960]);
});
