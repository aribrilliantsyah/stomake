import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/server/app';

let home: string;
let app: ReturnType<typeof createApp>;
const red = readFileSync(join(__dirname, 'fixtures/red.png'));
const docx = readFileSync(join(__dirname, 'fixtures/storyline.docx'));

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'sb-'));
  process.env.STORYBOARD_HOME = home;
  app = createApp();
  await app.request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'Selimut Darurat' }),
    headers: { 'content-type': 'application/json' },
  });
});

function upload(path: string, files: [string, Buffer][]) {
  const fd = new FormData();
  for (const [name, buf] of files) fd.append('files', new File([new Uint8Array(buf)], name, { type: 'application/octet-stream' }));
  return app.request(path, { method: 'POST', body: fd });
}

test('upload global "dont .png" → listed dengan width/height, url ter-encode', async () => {
  const r = await upload('/api/assets/global', [['dont .png', red]]);
  expect(r.status).toBe(200);
  const [info] = await r.json();
  expect(info).toEqual({ ref: 'global:dont .png', name: 'dont .png', width: 20, height: 40, url: '/files/global/dont%20.png' });
  const list = await (await app.request('/api/assets?project=selimut-darurat')).json();
  expect(list.global).toHaveLength(1);
  expect(list.project).toEqual([]);
  expect(existsSync(join(home, 'library/dont .png'))).toBe(true);
});

test('upload "todoroki.png" dua kali → kedua bernama "todoroki (2).png"', async () => {
  await upload('/api/assets/project/selimut-darurat', [['todoroki.png', red]]);
  const [second] = await (await upload('/api/assets/project/selimut-darurat', [['todoroki.png', red]])).json();
  expect(second.name).toBe('todoroki (2).png');
  expect(second.ref).toBe('project:todoroki (2).png');
  expect(second.url).toBe('/files/project/selimut-darurat/todoroki%20(2).png');
});

test('ekstensi .svg/.exe ditolak 400', async () => {
  expect((await upload('/api/assets/global', [['x.svg', red]])).status).toBe(400);
  expect((await upload('/api/assets/project/selimut-darurat', [['x.exe', red]])).status).toBe(400);
});

test('GET /files/project/:slug/:name mengembalikan bytes & content-type image/png', async () => {
  await upload('/api/assets/project/selimut-darurat', [['bg gunung.png', red]]);
  const r = await app.request('/files/project/selimut-darurat/bg%20gunung.png');
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toBe('image/png');
  expect(Buffer.from(await r.arrayBuffer()).equals(red)).toBe(true);
  expect((await app.request('/files/project/selimut-darurat/nope.png')).status).toBe(404);
  expect((await app.request('/files/global/..%2Fprojects')).status).toBe(400);
});

test('import docx → text berisi storyline dan tersimpan di storyline.txt', async () => {
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array(docx)], 'cara kerja selimut darurat.docx'));
  const r = await app.request('/api/projects/selimut-darurat/storyline/import', { method: 'POST', body: fd });
  expect(r.status).toBe(200);
  const { text } = await r.json();
  expect(text).toContain('kenapa orang yang hipotermia');
  expect(readFileSync(join(home, 'projects/selimut-darurat/storyline.txt'), 'utf8')).toBe(text);
});

test('paste ke scene: gambar disimpan sebagai clip (tidak muncul di daftar asset), bisa diambil lewat /files/clip', async () => {
  const fd = new FormData();
  fd.append('files', new File([new Uint8Array(red)], 'paste-20261013-120000.png', { type: 'image/png' }));
  const r = await app.request('/api/projects/selimut-darurat/clips', { method: 'POST', body: fd });
  expect(r.status).toBe(200);
  const [info] = await r.json();
  expect(info.ref).toBe('clip:paste-20261013-120000.png');
  expect(info.url).toBe('/files/clip/selimut-darurat/paste-20261013-120000.png');
  expect(existsSync(join(home, 'projects', 'selimut-darurat', 'clips', 'paste-20261013-120000.png'))).toBe(true);
  const list = await (await app.request('/api/assets?project=selimut-darurat')).json();
  expect(list.project).toEqual([]);
  const f = await app.request(info.url);
  expect(f.status).toBe(200);
  expect(f.headers.get('content-type')).toBe('image/png');
});

test('simpan clip ke asset project: file disalin ke assets (nama unik), clip tetap ada', async () => {
  const fd = new FormData();
  fd.append('files', new File([new Uint8Array(red)], 'tempel.png', { type: 'image/png' }));
  await app.request('/api/projects/selimut-darurat/clips', { method: 'POST', body: fd });
  await upload('/api/assets/project/selimut-darurat', [['tempel.png', red]]);
  const r = await app.request('/api/projects/selimut-darurat/clips/tempel.png/promote', { method: 'POST' });
  expect(r.status).toBe(200);
  const info = await r.json();
  expect(info.ref).toBe('project:tempel (2).png');
  expect(existsSync(join(home, 'projects', 'selimut-darurat', 'clips', 'tempel.png'))).toBe(true);
  expect((await app.request('/api/projects/selimut-darurat/clips/hilang.png/promote', { method: 'POST' })).status).toBe(404);
  expect((await app.request('/api/projects/selimut-darurat/clips/..%2Fproject.json/promote', { method: 'POST' })).status).toBe(400);
});

test('schema menerima ref clip:', async () => {
  const { parseProject } = await import('../src/shared/schema');
  const { createProject } = await import('../src/shared/model');
  const p = createProject('A', 'now');
  p.pages[0].scenes[0].panels[0].background = { kind: 'asset', ref: 'clip:x.png', fit: 'cover' };
  expect(() => parseProject(p)).not.toThrow();
});

async function json(path: string, init?: RequestInit) {
  const res = await app.request(path, init);
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('hapus asset project → pindah ke trash, hilang dari daftar, bisa dipulihkan', async () => {
  await upload('/api/assets/project/selimut-darurat', [['kipas.png', red]]);
  const del = await json('/api/assets/project/selimut-darurat/kipas.png', { method: 'DELETE' });
  expect(del.status).toBe(200);
  expect(del.body.trashId).toMatch(/^\d{13}-[a-z0-9]{6}$/);
  expect(existsSync(join(home, 'projects', 'selimut-darurat', 'assets', 'kipas.png'))).toBe(false);
  expect((await json('/api/assets?project=selimut-darurat')).body.project).toEqual([]);
  const back = await json(`/api/assets/trash/${del.body.trashId}/restore`, { method: 'POST' });
  expect(back.status).toBe(200);
  expect(back.body.ref).toBe('project:kipas.png');
  expect((await json('/api/assets?project=selimut-darurat')).body.project).toHaveLength(1);
  // restored once only
  expect((await json(`/api/assets/trash/${del.body.trashId}/restore`, { method: 'POST' })).status).toBe(404);
});

test('hapus asset global; pulihkan saat nama sudah dipakai lagi → nama unik', async () => {
  await upload('/api/assets/global', [['api.png', red]]);
  const del = await json('/api/assets/global/api.png', { method: 'DELETE' });
  expect(del.status).toBe(200);
  await upload('/api/assets/global', [['api.png', red]]);
  const back = await json(`/api/assets/trash/${del.body.trashId}/restore`, { method: 'POST' });
  expect(back.body.ref).toBe('global:api (2).png');
});

test('hapus asset: 404 bila tidak ada, 400 untuk nama/slug/trash id tidak valid', async () => {
  expect((await app.request('/api/assets/global/tidak-ada.png', { method: 'DELETE' })).status).toBe(404);
  expect((await app.request('/api/assets/global/..%2Fsettings.json', { method: 'DELETE' })).status).toBe(400);
  expect((await app.request('/api/assets/project/BAD!/x.png', { method: 'DELETE' })).status).toBe(400);
  expect((await app.request('/api/assets/trash/..%2F..%2Fx/restore', { method: 'POST' })).status).toBe(400);
});

test('pemakaian asset: global dihitung di semua project, project hanya di project itu', async () => {
  await upload('/api/assets/global', [['api.png', red]]);
  const pj = await json('/api/projects/selimut-darurat');
  const p = pj.body;
  p.pages[0].scenes[0].panels[0].layers.push({ id: 'a', type: 'image', ref: 'global:api.png', x: 1, y: 1, width: 1, height: 1, rotation: 0, opacity: 1, flipX: false, flipY: false });
  p.pages[0].background = { kind: 'asset', ref: 'global:api.png', fit: 'cover' };
  await app.request('/api/projects/selimut-darurat', { method: 'PUT', body: JSON.stringify(p), headers: { 'content-type': 'application/json' } });
  const u = await json('/api/assets/usage?ref=' + encodeURIComponent('global:api.png'));
  expect((await json('/api/assets/usage?project=selimut-darurat&ref=' + encodeURIComponent('project:api.png'))).body).toEqual([]);
  expect(u.body).toEqual([{ slug: 'selimut-darurat', name: 'Selimut Darurat', count: 2 }]);
  expect((await json('/api/assets/usage?ref=' + encodeURIComponent('global:lain.png'))).body).toEqual([]);
  expect((await app.request('/api/assets/usage?ref=bad')).status).toBe(400);
});
