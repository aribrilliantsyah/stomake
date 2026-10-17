import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { Hono } from 'hono';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/server/app';

const RED = new Uint8Array(readFileSync(join(__dirname, 'fixtures/red.png')));
let config: string;
let app: Hono;
const saved = process.env.STORYBOARD_HOME;

beforeEach(() => {
  // no STORYBOARD_HOME: the folder chosen in Pengaturan applies
  delete process.env.STORYBOARD_HOME;
  config = mkdtempSync(join(tmpdir(), 'sb-cfg-'));
  process.env.STORYBOARD_CONFIG_DIR = config;
  app = createApp();
});
afterEach(() => {
  delete process.env.STORYBOARD_CONFIG_DIR;
  if (saved === undefined) delete process.env.STORYBOARD_HOME;
  else process.env.STORYBOARD_HOME = saved;
});

const json = (body: unknown, method = 'POST') => ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const setRoot = (dataRoot: string) => app.request('/api/settings/storage', json({ dataRoot }, 'PUT'));
const slugs = async () => ((await (await app.request('/api/projects?status=all')).json()).items as { slug: string }[]).map((p) => p.slug).sort();
async function upload(scope: 'global' | 'project', name: string, slug?: string) {
  const fd = new FormData();
  fd.append('files', new File([RED], name, { type: 'image/png' }));
  await app.request(scope === 'global' ? '/api/assets/global' : `/api/assets/project/${slug}`, { method: 'POST', body: fd });
}
async function importZip(bytes: Uint8Array<ArrayBuffer>) {
  const fd = new FormData();
  fd.append('file', new File([bytes], 'p.zip', { type: 'application/zip' }));
  return app.request('/api/projects/import', { method: 'POST', body: fd });
}

test('ganti folder: project baru masuk folder baru, pilihan bertahan setelah restart, folder lama tidak disentuh', async () => {
  const a = mkdtempSync(join(tmpdir(), 'sb-a-'));
  const b = mkdtempSync(join(tmpdir(), 'sb-b-'));
  expect((await setRoot(a)).status).toBe(200);
  await app.request('/api/projects', json({ name: 'Di A' }));
  expect(existsSync(join(a, 'projects/di-a/project.json'))).toBe(true);

  const r = await setRoot(b);
  expect((await r.json()).storage).toMatchObject({ dataRoot: b, fixedByEnv: false });
  expect(await slugs()).toEqual([]);
  // a fresh process reads the pointer from the OS config folder
  app = createApp();
  expect((await (await app.request('/api/settings')).json()).storage.dataRoot).toBe(b);
  expect(existsSync(join(a, 'projects/di-a/project.json'))).toBe(true);
});

test('ganti folder: path relatif ditolak 400', async () => {
  expect((await setRoot('relatif/folder')).status).toBe(400);
});

test('folder project yang di-copy ke projects/ langsung terbaca', async () => {
  const a = mkdtempSync(join(tmpdir(), 'sb-a-'));
  const other = mkdtempSync(join(tmpdir(), 'sb-o-'));
  await setRoot(other);
  await app.request('/api/projects', json({ name: 'Kipas Angin' }));
  await setRoot(a);
  mkdirSync(join(a, 'projects'), { recursive: true });
  cpSync(join(other, 'projects/kipas-angin'), join(a, 'projects/kipas-angin'), { recursive: true });
  expect(await slugs()).toEqual(['kipas-angin']);
  expect((await app.request('/api/projects/kipas-angin')).status).toBe(200);
});

test('export .zip lalu import di folder lain: isi, storyline, asset project & global lengkap', async () => {
  const a = mkdtempSync(join(tmpdir(), 'sb-a-'));
  await setRoot(a);
  const { slug } = await (await app.request('/api/projects', json({ name: 'Selimut' }))).json();
  await upload('project', 'dont .png', slug);
  await upload('global', 'logo.png');
  await upload('project', 'logo.png', slug); // same name as the global one: must not collide
  await app.request(`/api/projects/${slug}/storyline`, json({ text: 'naskah' }, 'PUT'));
  const p = await (await app.request(`/api/projects/${slug}`)).json();
  const img = (id: string, ref: string) => ({ id, type: 'image', ref, x: 540, y: 960, width: 100, height: 100, rotation: 0, opacity: 1, flipX: false, flipY: false });
  p.pages[0].scenes[0].panels[0].layers = [img('l1', 'project:dont .png'), img('l2', 'global:logo.png'), img('l3', 'project:logo.png')];
  p.pageBackground = { kind: 'asset', ref: 'global:logo.png', fit: 'cover' };
  expect((await app.request(`/api/projects/${slug}`, json(p, 'PUT'))).status).toBe(200);

  const r = await app.request(`/api/projects/${slug}/export.zip`);
  expect(r.headers.get('content-type')).toBe('application/zip');
  const bytes = new Uint8Array(await r.arrayBuffer());
  // fflate lists folder entries ("assets/") too; only files matter
  expect(Object.keys(unzipSync(bytes)).filter((k) => !k.endsWith('/')).sort()).toEqual(['assets/dont .png', 'assets/logo (2).png', 'assets/logo.png', 'project.json', 'storyboard.json', 'storyline.txt']);

  // another computer: empty folder, no global library
  await setRoot(mkdtempSync(join(tmpdir(), 'sb-b-')));
  const imp = await importZip(bytes);
  expect(imp.status).toBe(200);
  const s2 = (await imp.json()).slug;
  const q = await (await app.request(`/api/projects/${s2}`)).json();
  expect(q.pages[0].scenes[0].panels[0].layers.map((l: { ref: string }) => l.ref)).toEqual(['project:dont .png', 'project:logo (2).png', 'project:logo.png']);
  expect(q.pageBackground.ref).toBe('project:logo (2).png');
  expect((await (await app.request(`/api/projects/${s2}/storyline`)).json()).text).toBe('naskah');
  expect((await app.request(`/files/project/${s2}/${encodeURIComponent('logo (2).png')}`)).status).toBe(200);

  // importing again doesn't overwrite: new slug
  expect((await (await importZip(bytes)).json()).slug).toBe(`${s2}-2`);
});

test('import: bukan zip / tanpa project.json / project.json rusak → 400, tidak ada folder tersisa', async () => {
  const a = mkdtempSync(join(tmpdir(), 'sb-a-'));
  await setRoot(a);
  for (const bad of [strToU8('bukan zip'), zipSync({ 'x.txt': strToU8('hi') }), zipSync({ 'project.json': strToU8('{"name":"x"}') })]) {
    const r = await importZip(bad);
    expect(r.status).toBe(400);
    expect(typeof (await r.json()).error).toBe('string');
  }
  expect(existsSync(join(a, 'projects')) ? readdirSync(join(a, 'projects')) : []).toEqual([]);
});

test('import: zip dengan folder induk diterima; path traversal & file non-gambar diabaikan', async () => {
  const a = mkdtempSync(join(tmpdir(), 'sb-a-'));
  const other = mkdtempSync(join(tmpdir(), 'sb-o-'));
  await setRoot(other);
  await app.request('/api/projects', json({ name: 'Asli' }));
  const project = readFileSync(join(other, 'projects/asli/project.json'));
  await setRoot(a);
  const r = await importZip(
    zipSync({ 'asli/project.json': new Uint8Array(project), 'asli/assets/ok.png': RED, 'asli/assets/../../evil.png': RED, 'asli/assets/run.sh': strToU8('rm -rf') }),
  );
  expect(r.status).toBe(200);
  const slug = (await r.json()).slug;
  expect(readdirSync(join(a, 'projects', slug, 'assets'))).toEqual(['ok.png']);
  expect(existsSync(join(a, 'evil.png'))).toBe(false);
});

test('export.zip ke path (desktop): ditulis ke file; path relatif / bukan .zip → 400', async () => {
  const a = mkdtempSync(join(tmpdir(), 'sb-a-'));
  await setRoot(a);
  const { slug } = await (await app.request('/api/projects', json({ name: 'Ke Disk' }))).json();
  const out = join(a, 'out.zip');
  expect((await app.request(`/api/projects/${slug}/export.zip`, json({ path: out }))).status).toBe(200);
  expect(Object.keys(unzipSync(readFileSync(out)))).toContain('project.json');
  expect((await app.request(`/api/projects/${slug}/export.zip`, json({ path: 'out.zip' }))).status).toBe(400);
  expect((await app.request(`/api/projects/${slug}/export.zip`, json({ path: join(a, 'x.txt') }))).status).toBe(400);
});
