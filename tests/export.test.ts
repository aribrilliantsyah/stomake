import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/server/app';
import { BRUSH, FRAME } from '../src/shared/layout';
import { closeBrowser } from '../src/server/export';
import { addCover, addLayer, defaultEmoji, defaultText, withPageSizes, flatScenes, layerFromDrop, updatePanel, updateScene } from '../src/shared/model';
import type { Project } from '../src/shared/types';

const dist = join(__dirname, '..', 'dist');
const hasBuild = existsSync(join(dist, 'index.html'));
let server: ServerType;
let base = '';
let home = '';

beforeAll(async () => {
  if (!hasBuild) execFileSync('pnpm', ['build'], { cwd: join(__dirname, '..'), stdio: 'ignore' });
  await new Promise<void>((resolve) => {
    const app = createApp({ staticDir: dist, webUrl: '' });
    server = serve({ fetch: (req) => app.fetch(req), hostname: '127.0.0.1', port: 0 }, (info: AddressInfo) => {
      base = `http://127.0.0.1:${info.port}`;
      process.env.STORYBOARD_WEB_URL = base;
      resolve();
    });
  });
}, 120_000);

afterAll(async () => {
  await closeBrowser();
  server?.close();
});

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sb-export-'));
  process.env.STORYBOARD_HOME = home;
});

const call = (path: string, init?: RequestInit) => fetch(base + path, init);
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

async function makeProject(name: string, n: number, edit: (p: Project) => Project = (p) => p) {
  const { slug } = await (await call('/api/projects', json('POST', { name }))).json();
  let p: Project = await (await call(`/api/projects/${slug}`)).json();
  p = withPageSizes(p, Array.from({ length: Math.ceil(n / 3) }, (_, i) => Math.min(3, n - i * 3)));
  p = edit(p);
  const r = await call(`/api/projects/${slug}`, json('PUT', p));
  expect(r.status).toBe(200);
  return slug as string;
}

function pdfText(file: string, page: number) {
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-layout', file, '-']).toString();
}
function pdfInfo(file: string) {
  return execFileSync('pdfinfo', [file]).toString();
}

test('project 4 scene → PDF 2 halaman, ukuran 708.75x567, Scene 4 di halaman 2', async () => {
  const slug = await makeProject('Selimut Darurat', 4, (p) => {
    const s = flatScenes(p);
    p = updateScene(p, s[0].scene.id, { subtitle: 'kenapa orang yang hipotermia' });
    p = updateScene(p, s[2].scene.id, { note: 'selembar alumunium foil muncul dari bawah', subtitle: 'biasanya dikasih selimut kayak alu-minium foil gini' });
    return updateScene(p, s[3].scene.id, { subtitle: 'padahal ini tipis kan, emang bisa bikin anget?' });
  });
  const r = await call(`/api/projects/${slug}/export`, { method: 'POST' });
  const body = await r.json();
  expect(r.status, JSON.stringify(body)).toBe(200);
  expect(body.missingAssets).toEqual([]);
  expect(body.path).toBe(join(home, 'projects', slug, 'exports', 'storyboard.pdf'));
  const info = pdfInfo(body.path);
  expect(info).toMatch(/Pages:\s+2/);
  const [, w, h] = info.match(/Page size:\s+([\d.]+) x ([\d.]+)/)!;
  expect(Math.abs(Number(w) - 708.75)).toBeLessThan(1);
  expect(Math.abs(Number(h) - 567)).toBeLessThan(1);
  const p1 = pdfText(body.path, 1);
  expect(p1).toContain('STORYBOARD');
  expect(p1).toContain('Scene 1');
  expect(p1).toContain('Scene 3');
  expect(p1).toContain('kenapa orang yang hipotermia');
  expect(p1).toContain('alumunium foil muncul');
  expect(p1).not.toContain('Scene 4');
  const p2 = pdfText(body.path, 2);
  expect(p2).toContain('Scene 4');
  expect(p2).toContain('emang bisa');
  // download endpoint
  const dl = await call(`/api/projects/${slug}/export.pdf`);
  expect(dl.headers.get('content-type')).toBe('application/pdf');
}, 120_000);

test('asset hilang → export sukses, missingAssets terisi', async () => {
  const slug = await makeProject('Hilang', 1, (p) => {
    const panelId = p.pages[0].scenes[0].panels[0].id;
    p = addLayer(p, panelId, layerFromDrop({ ref: 'project:hilang.png', name: 'hilang.png', width: 10, height: 10, url: '' }, 540, 960, { w: 1080, h: 1920 }));
    return updatePanel(p, panelId, (pn) => ({ ...pn, background: { kind: 'asset', ref: 'global:bg tidak ada.jpg', fit: 'cover' } }));
  });
  const r = await call(`/api/projects/${slug}/export`, { method: 'POST' });
  const body = await r.json();
  expect(r.status, JSON.stringify(body)).toBe(200);
  expect(body.missingAssets).toEqual(['global:bg tidak ada.jpg', 'project:hilang.png']);
  expect(existsSync(body.path)).toBe(true);
}, 120_000);

test('asset berspasi "dont .png" ter-render (missingAssets kosong) & subtitle panjang tidak menimpa', async () => {
  const slug = await makeProject('Spasi', 1);
  copyFileSync(join(__dirname, 'fixtures/red.png'), join(home, 'projects', slug, 'assets', 'dont .png'));
  const p: Project = await (await call(`/api/projects/${slug}`)).json();
  const panelId = p.pages[0].scenes[0].panels[0].id;
  let q = addLayer(p, panelId, layerFromDrop({ ref: 'project:dont .png', name: 'dont .png', width: 20, height: 40, url: '' }, 540, 960, { w: 1080, h: 1920 }));
  q = updateScene(q, q.pages[0].scenes[0].id, { subtitle: 'Tubuh manusia itu terus-terusan ngeluarin panas '.repeat(12) });
  await call(`/api/projects/${slug}`, json('PUT', q));
  const body = await (await call(`/api/projects/${slug}/export`, { method: 'POST' })).json();
  expect(body.missingAssets).toEqual([]);
  const txt = pdfText(body.path, 1);
  expect(txt).toContain('…');
  const lines = txt.split('\n').filter((l) => l.includes('Tubuh') || l.includes('ngeluarin') || l.includes('panas'));
  expect(lines.length).toBeLessThanOrEqual(4);
}, 120_000);

test('frame resolusi tinggi, font Bangers termuat, subtitle maks 4 baris', async () => {
  const slug = await makeProject('Kualitas', 1, (p) => {
    const panelId = p.pages[0].scenes[0].panels[0].id;
    p = addLayer(p, panelId, { ...defaultText({ w: 1080, h: 1920 }), text: 'WISTAR' });
    return updateScene(p, p.pages[0].scenes[0].id, { subtitle: ('merasa dingin sekali sampai menggigil dan ' ).repeat(15) });
  });
  const body = await (await call(`/api/projects/${slug}/export`, { method: 'POST' })).json();
  const imgs = execFileSync('pdfimages', ['-list', body.path]).toString().split('\n').slice(2).filter(Boolean);
  const widths = imgs.map((l) => Number(l.trim().split(/\s+/)[3]));
  expect(Math.max(...widths)).toBeGreaterThanOrEqual(FRAME.w * 4); // 4x of frame pt
  expect(body.fonts).toEqual(expect.arrayContaining(['Bangers', 'Coming Soon', 'Inter']));
  const bbox = execFileSync('pdftotext', ['-bbox', body.path, '-']).toString();
  const ys = new Set([...bbox.matchAll(/yMin="([\d.]+)"[^>]*>(?:merasa|dingin|sekali|sampai|menggigil|dan)/g)].map((m) => Math.round(Number(m[1]))));
  expect(ys.size).toBeLessThanOrEqual(4);
  expect(Math.max(...ys)).toBeLessThan(BRUSH.y);
}, 120_000);

test('cover → PDF halaman 1 berisi judul tanpa "Scene"; Scene 1 di halaman 2; page 1 scene di tengah', async () => {
  const slug = await makeProject('Cover', 1, (p) => {
    p = addCover(p);
    p = { ...p, cover: { ...p.cover!, panel: { ...p.cover!.panel, layers: [{ ...defaultEmoji('🔥', { w: 1080, h: 1920 }) }] } } };
    return withPageSizes(p, [1, 2]);
  });
  const body = await (await call(`/api/projects/${slug}/export`, { method: 'POST' })).json();
  expect(pdfInfo(body.path)).toMatch(/Pages:\s+3/);
  const p1 = pdfText(body.path, 1);
  expect(p1).toContain('VISUAL ASLI');
  expect(p1).not.toContain('Scene');
  expect(p1).not.toContain('STORYBOARD');
  expect(pdfText(body.path, 2)).toContain('Scene 1');
  expect(pdfText(body.path, 3)).toContain('Scene 3');
  const bbox = execFileSync('pdftotext', ['-f', '2', '-l', '2', '-bbox', body.path, '-']).toString();
  const x = Number(bbox.match(/xMin="([\d.]+)"[^>]*>Scene</)![1]);
  expect(Math.abs(x - 255.375)).toBeLessThan(3);
}, 120_000);

test('font tersedia → missingFonts [], font tidak ada → dilaporkan', async () => {
  const slug = await makeProject('Font', 1, (p) => {
    const panelId = p.pages[0].scenes[0].panels[0].id;
    p = addLayer(p, panelId, { ...defaultText({ w: 1080, h: 1920 }), font: 'Poppins' });
    return addLayer(p, panelId, { ...defaultText({ w: 1080, h: 1920 }), font: 'Font Tidak Ada', y: 300 });
  });
  const body = await (await call(`/api/projects/${slug}/export`, { method: 'POST' })).json();
  expect(body.missingFonts).toEqual(['Font Tidak Ada']);
}, 120_000);

test('thumbnail: PNG dibuat sekali lalu di-cache; diperbarui setelah project berubah', async () => {
  const slug = await makeProject('Thumb', 2);
  const r1 = await call(`/api/projects/${slug}/thumb.png`);
  expect(r1.status).toBe(200);
  expect(r1.headers.get('content-type')).toBe('image/png');
  const b1 = Buffer.from(await r1.arrayBuffer());
  expect(b1.subarray(1, 4).toString()).toBe('PNG');
  expect(b1.readUInt32BE(16)).toBe(480); // width px
  const thumb = join(home, 'projects', slug, 'thumb.png');
  const m1 = statSync(thumb).mtimeMs;
  await call(`/api/projects/${slug}/thumb.png`);
  expect(statSync(thumb).mtimeMs).toBe(m1);
  const p = await (await call(`/api/projects/${slug}`)).json();
  await new Promise((res) => setTimeout(res, 20));
  await call(`/api/projects/${slug}`, json('PUT', updateScene(p, p.pages[0].scenes[0].id, { subtitle: 'baru' })));
  await call(`/api/projects/${slug}/thumb.png`);
  expect(statSync(thumb).mtimeMs).toBeGreaterThan(m1);
}, 120_000);

test('teardown tmp', () => {
  rmSync(home, { recursive: true, force: true });
  expect(readFileSync).toBeTypeOf('function');
});
