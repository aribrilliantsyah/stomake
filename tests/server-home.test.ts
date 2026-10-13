import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/server/app';

let home: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sb-home-'));
  process.env.STORYBOARD_HOME = home;
  app = createApp();
});

const json = (body: unknown, method = 'POST') => ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const create = async (name: string) => ((await (await app.request('/api/projects', json({ name }))).json()) as { slug: string }).slug;
const list = async (qs = '') => (await app.request(`/api/projects${qs}`)).json();
const file = (slug: string) => join(home, 'projects', slug, 'project.json');

/** Rewrite timestamps / page count on disk to control sorting. */
function patchDisk(slug: string, fn: (p: Record<string, any>) => void) {
  const p = JSON.parse(readFileSync(file(slug), 'utf8'));
  fn(p);
  writeFileSync(file(slug), JSON.stringify(p));
}

test('list: bentuk {items,total,page,size}, ringkasan berisi jumlah scene/page, status, created', async () => {
  const s = await create('Selimut Darurat');
  const r = await list();
  expect(r).toMatchObject({ total: 1, page: 1, size: 24 });
  expect(r.items[0]).toMatchObject({ slug: s, name: 'Selimut Darurat', scenes: 1, pages: 1, archived: false, hasCover: false });
  expect(r.items[0].createdAt).toBeTruthy();
  expect(r.items[0].updatedAt).toBeTruthy();
});

test('cari nama (tidak peka huruf besar) dan slug', async () => {
  await create('Selimut Darurat');
  await create('Kenapa Kipas Bisa Debuan');
  await create('Tikus Percobaan');
  expect((await list('?q=KIPAS')).items.map((i: any) => i.name)).toEqual(['Kenapa Kipas Bisa Debuan']);
  expect((await list('?q=tikus-per')).total).toBe(1);
  expect((await list('?q=zzz')).items).toEqual([]);
});

test('urutkan: updated (default), name, created, scenes', async () => {
  const a = await create('Bravo');
  const b = await create('alpha');
  const c = await create('Charlie');
  patchDisk(a, (p) => { p.updatedAt = '2026-10-10T00:00:00.000Z'; p.createdAt = '2026-01-03T00:00:00.000Z'; });
  patchDisk(b, (p) => { p.updatedAt = '2026-10-12T00:00:00.000Z'; p.createdAt = '2026-01-01T00:00:00.000Z'; p.pages[0].scenes.push(structuredClone(p.pages[0].scenes[0])); p.pages[0].scenes[1].id = 'x'; });
  patchDisk(c, (p) => { p.updatedAt = '2026-10-11T00:00:00.000Z'; p.createdAt = '2026-01-02T00:00:00.000Z'; });
  const names = async (qs: string) => (await list(qs)).items.map((i: any) => i.name);
  expect(await names('')).toEqual(['alpha', 'Charlie', 'Bravo']);
  expect(await names('?sort=name')).toEqual(['alpha', 'Bravo', 'Charlie']);
  expect(await names('?sort=created')).toEqual(['Bravo', 'Charlie', 'alpha']);
  expect((await names('?sort=scenes'))[0]).toBe('alpha');
});

test('filter waktu diubah: since=7 / 30 hari', async () => {
  const a = await create('Lama');
  await create('Baru');
  patchDisk(a, (p) => { p.updatedAt = new Date(Date.now() - 20 * 86400e3).toISOString(); });
  expect((await list('?since=7')).items.map((i: any) => i.name)).toEqual(['Baru']);
  expect((await list('?since=30')).total).toBe(2);
});

test('pagination: size & page, page di luar batas → kosong; size dibatasi 1..100', async () => {
  for (let i = 1; i <= 5; i++) await create(`P${i}`);
  const p1 = await list('?size=2&page=1&sort=name');
  expect(p1).toMatchObject({ total: 5, page: 1, size: 2 });
  expect(p1.items.map((i: any) => i.name)).toEqual(['P1', 'P2']);
  expect((await list('?size=2&page=3&sort=name')).items.map((i: any) => i.name)).toEqual(['P5']);
  expect((await list('?size=2&page=9')).items).toEqual([]);
  expect((await list('?size=999')).size).toBe(100);
  expect((await list('?size=0&page=-3')).size).toBe(1);
});

test('arsip: disembunyikan dari status=active (default), muncul di archived & all; pulihkan', async () => {
  const s = await create('Arsipku');
  await create('Aktif');
  const r = await app.request(`/api/projects/${s}/archive`, json({ archived: true }));
  expect(r.status).toBe(200);
  expect((await list()).items.map((i: any) => i.name)).toEqual(['Aktif']);
  expect((await list('?status=archived')).items.map((i: any) => i.name)).toEqual(['Arsipku']);
  expect((await list('?status=all')).total).toBe(2);
  await app.request(`/api/projects/${s}/archive`, json({ archived: false }));
  expect((await list()).total).toBe(2);
  // editor save keeps archived flag
  const p = await (await app.request(`/api/projects/${s}`)).json();
  expect(p.archived).toBe(false);
});

test('ganti nama: nama berubah, slug tetap; nama kosong → 400', async () => {
  const s = await create('Lama');
  const r = await app.request(`/api/projects/${s}/rename`, json({ name: '  Baru Sekali ' }));
  expect(await r.json()).toEqual({ slug: s, name: 'Baru Sekali' });
  expect((await (await app.request(`/api/projects/${s}`)).json()).name).toBe('Baru Sekali');
  expect((await app.request(`/api/projects/${s}/rename`, json({ name: ' ' }))).status).toBe(400);
});

test('duplikat: slug baru, nama "(salinan)", asset & storyline ikut, tidak ikut arsip/export', async () => {
  const s = await create('Selimut');
  writeFileSync(join(home, 'projects', s, 'assets', 'dont .png'), 'x');
  writeFileSync(join(home, 'projects', s, 'storyline.txt'), 'kenapa');
  writeFileSync(join(home, 'projects', s, 'exports', 'storyboard.pdf'), 'pdf');
  await app.request(`/api/projects/${s}/archive`, json({ archived: true }));
  const r = await (await app.request(`/api/projects/${s}/duplicate`, { method: 'POST' })).json();
  expect(r.slug).toBe('selimut-salinan');
  const p = await (await app.request(`/api/projects/${r.slug}`)).json();
  expect(p.name).toBe('Selimut (salinan)');
  expect(p.archived).toBe(false);
  expect(existsSync(join(home, 'projects', r.slug, 'assets', 'dont .png'))).toBe(true);
  expect(readFileSync(join(home, 'projects', r.slug, 'storyline.txt'), 'utf8')).toBe('kenapa');
  expect(existsSync(join(home, 'projects', r.slug, 'exports', 'storyboard.pdf'))).toBe(false);
});

test('hapus → pindah ke trash (tidak permanen), hilang dari list; restore mengembalikan', async () => {
  const s = await create('Hapusku');
  const r = await app.request(`/api/projects/${s}`, { method: 'DELETE' });
  const { trashId } = await r.json();
  expect(r.status).toBe(200);
  expect(existsSync(join(home, 'projects', s))).toBe(false);
  expect(readdirSync(join(home, 'trash'))).toEqual([trashId]);
  expect((await list('?status=all')).total).toBe(0);
  expect((await app.request(`/api/projects/${s}`)).status).toBe(404);
  const back = await (await app.request(`/api/trash/${trashId}/restore`, { method: 'POST' })).json();
  expect(back.slug).toBe(s);
  expect((await list()).total).toBe(1);
  expect(readdirSync(join(home, 'trash'))).toEqual([]);
});

test('restore saat slug sudah dipakai lagi → slug baru; trashId tidak valid → 400/404', async () => {
  const s = await create('Sama');
  const { trashId } = await (await app.request(`/api/projects/${s}`, { method: 'DELETE' })).json();
  await create('Sama');
  const back = await (await app.request(`/api/trash/${trashId}/restore`, { method: 'POST' })).json();
  expect(back.slug).toBe('sama-2');
  expect((await app.request('/api/trash/..%2Fprojects/restore', { method: 'POST' })).status).toBe(400);
  expect((await app.request('/api/trash/tidak-ada__1760000000000/restore', { method: 'POST' })).status).toBe(404);
  expect((await app.request('/api/trash/tidak-ada-123/restore', { method: 'POST' })).status).toBe(400);
});

test('aksi massal: archive / delete beberapa slug sekaligus', async () => {
  const a = await create('A1');
  const b = await create('B1');
  await create('C1');
  const r = await (await app.request('/api/projects/bulk', json({ action: 'archive', slugs: [a, b] }))).json();
  expect(r).toEqual({ ok: [a, b], failed: [] });
  expect((await list()).items.map((i: any) => i.name)).toEqual(['C1']);
  const d = await (await app.request('/api/projects/bulk', json({ action: 'delete', slugs: [a, 'tidak-ada'] }))).json();
  expect(d.ok).toEqual([a]);
  expect(d.failed).toEqual(['tidak-ada']);
  expect(d.trashIds).toHaveLength(1);
  expect((await app.request('/api/projects/bulk', json({ action: 'meledak', slugs: [b] }))).status).toBe(400);
});

test('project.json rusak tetap muncul sebagai "rusak" (tidak hilang diam-diam)', async () => {
  const s = await create('Rusak');
  writeFileSync(file(s), '{oops');
  const r = await list();
  expect(r.items[0]).toMatchObject({ slug: s, broken: true });
});
