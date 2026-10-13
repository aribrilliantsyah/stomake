import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/server/app';
import { isSafeName, slugify } from '../src/server/paths';

let home: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sb-'));
  process.env.STORYBOARD_HOME = home;
  app = createApp();
});

const json = (body: unknown, method = 'POST') => ({
  method,
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});
const create = async (name: string) => (await app.request('/api/projects', json({ name }))).json();

test('POST lalu GET project', async () => {
  expect(await create('Selimut Darurat')).toEqual({ slug: 'selimut-darurat' });
  expect(existsSync(join(home, 'projects/selimut-darurat/assets'))).toBe(true);
  const p = await (await app.request('/api/projects/selimut-darurat')).json();
  expect(p.name).toBe('Selimut Darurat');
  expect(p.pages[0].scenes).toHaveLength(1);
});

test('nama bentrok → slug -2', async () => {
  await create('Selimut Darurat');
  expect(await create('Selimut Darurat')).toEqual({ slug: 'selimut-darurat-2' });
});

test('nama kosong → 400', async () => {
  expect((await app.request('/api/projects', json({ name: '  ' }))).status).toBe(400);
});

test('PUT body invalid → 400 dan file lama utuh', async () => {
  await create('A');
  const before = readFileSync(join(home, 'projects/a/project.json'), 'utf8');
  const r = await app.request('/api/projects/a', json({ version: 1, pages: [] }, 'PUT'));
  expect(r.status).toBe(400);
  expect(readFileSync(join(home, 'projects/a/project.json'), 'utf8')).toBe(before);
});

test('PUT valid memperbarui updatedAt, tidak ada .tmp tersisa', async () => {
  await create('A');
  const p = await (await app.request('/api/projects/a')).json();
  p.pages[0].scenes[0].subtitle = 'kenapa orang yang hipotermia';
  const r = await app.request('/api/projects/a', json(p, 'PUT'));
  expect(r.status).toBe(200);
  const { updatedAt } = await r.json();
  expect(updatedAt).not.toBe(p.updatedAt);
  const q = await (await app.request('/api/projects/a')).json();
  expect(q.pages[0].scenes[0].subtitle).toBe('kenapa orang yang hipotermia');
  expect(readdirSync(join(home, 'projects/a')).some((f) => f.endsWith('.tmp'))).toBe(false);
});

test('slug tidak valid → 400, tidak ada → 404', async () => {
  expect((await app.request('/api/projects/..%2Fetc')).status).toBe(400);
  expect((await app.request('/api/projects/Bad.Slug')).status).toBe(400);
  expect((await app.request('/api/projects/nope')).status).toBe(404);
});

test('GET daftar urut updatedAt terbaru', async () => {
  await create('Lama');
  await new Promise((r) => setTimeout(r, 10));
  await create('Baru');
  const list = (await (await app.request('/api/projects')).json()).items;
  expect(list.map((x: { slug: string }) => x.slug)).toEqual(['baru', 'lama']);
  expect(list[0]).toHaveProperty('name', 'Baru');
});

test('storyline PUT/GET roundtrip; default ""', async () => {
  await create('A');
  expect(await (await app.request('/api/projects/a/storyline')).json()).toEqual({ text: '' });
  await app.request('/api/projects/a/storyline', json({ text: 'Nahh jadi…' }, 'PUT'));
  expect(await (await app.request('/api/projects/a/storyline')).json()).toEqual({ text: 'Nahh jadi…' });
  await app.request('/api/projects/a/storyline', json({ text: 'beacon' }, 'POST'));
  expect(await (await app.request('/api/projects/a/storyline')).json()).toEqual({ text: 'beacon' });
});

test('slugify & isSafeName', () => {
  expect(slugify('Kenapa Pakai Tikus Percobaan?')).toBe('kenapa-pakai-tikus-percobaan');
  expect(slugify('   ')).toBe('');
  expect(isSafeName('dont .png')).toBe(true);
  expect(isSafeName('todoroki selimutan kain basah.png')).toBe(true);
  expect(isSafeName('../a.png')).toBe(false);
  expect(isSafeName('.x')).toBe(false);
  expect(isSafeName('a/b')).toBe(false);
  expect(isSafeName('a\\b')).toBe(false);
  expect(isSafeName('')).toBe(false);
});

test('tulis tanpa content-type JSON ditolak (CSRF)', async () => {
  const r = await app.request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'x' }), headers: { 'content-type': 'text/plain' } });
  expect(r.status).toBe(415);
});

test('Origin asing ditolak, localhost diterima', async () => {
  const bad = await app.request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'x' }), headers: { 'content-type': 'application/json', origin: 'https://evil.example' } });
  expect(bad.status).toBe(403);
  const fd = new FormData();
  fd.append('files', new File([new Uint8Array([1])], 'a.png'));
  expect((await app.request('/api/assets/global', { method: 'POST', body: fd, headers: { origin: 'https://evil.example' } })).status).toBe(403);
  const ok = await app.request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'x' }), headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' } });
  expect(ok.status).toBe(200);
});

test('readProject pada file v1 di disk → v2, file belum ditulis ulang', async () => {
  await create('Lama');
  const file = join(home, 'projects/lama/project.json');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  raw.version = 1;
  delete raw.cover;
  writeFileSync(file, JSON.stringify(raw));
  const p = await (await app.request('/api/projects/lama')).json();
  expect(p.version).toBe(2);
  expect(p.cover).toBeNull();
  expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
});
