import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/server/app';
import { agentLock, publish, setLiveTimings, subscribe, withWriteLock, type LiveEvent } from '../src/server/live';

let app: ReturnType<typeof createApp>;
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const create = async (name: string) => ((await (await app.request('/api/projects', json('POST', { name }))).json()) as { slug: string }).slug;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  process.env.STORYBOARD_HOME = mkdtempSync(join(tmpdir(), 'sb-live-'));
  app = createApp();
  setLiveTimings({ ack: 200, idle: 300 });
});
afterEach(() => setLiveTimings({ ack: 3000, idle: 10000 }));

test('withWriteLock: slug sama berurutan, slug beda paralel', async () => {
  const log: string[] = [];
  const job = (id: string, ms: number) => async () => {
    log.push(`${id}1`);
    await sleep(ms);
    log.push(`${id}2`);
  };
  await Promise.all([withWriteLock('s', job('a', 30)), withWriteLock('s', job('b', 1))]);
  expect(log).toEqual(['a1', 'a2', 'b1', 'b2']);
  log.length = 0;
  await Promise.all([withWriteLock('x', job('a', 30)), withWriteLock('y', job('b', 1))]);
  expect(log).toEqual(['a1', 'b1', 'b2', 'a2']);
});

test('withWriteLock: error tidak memblokir antrean', async () => {
  await expect(withWriteLock('e', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  expect(await withWriteLock('e', async () => 7)).toBe(7);
});

test('beginOrExtend tanpa ack menunggu timeout ack; klien menerima agent active', async () => {
  const got: LiveEvent[] = [];
  const sub = subscribe('p1', (e) => got.push(e));
  const t0 = Date.now();
  await agentLock.beginOrExtend('p1');
  const dt = Date.now() - t0;
  expect(dt).toBeGreaterThanOrEqual(190);
  expect(dt).toBeLessThan(1000);
  expect(got.some((e) => e.type === 'agent' && e.active)).toBe(true);
  expect(agentLock.state('p1')).toBe('active');
  sub.close();
});

test('beginOrExtend dengan ack segera selesai cepat; tanpa klien langsung aktif', async () => {
  const sub = subscribe('p2', (e) => {
    if (e.type === 'agent' && e.active) setTimeout(() => agentLock.ack('p2', sub.clientId), 5);
  });
  const t0 = Date.now();
  await agentLock.beginOrExtend('p2');
  expect(Date.now() - t0).toBeLessThan(100);
  sub.close();
  const t1 = Date.now();
  await agentLock.beginOrExtend('p3');
  expect(Date.now() - t1).toBeLessThan(50);
});

test('pending: PUT editor (flush) diterima; active: PUT/DELETE/archive/rename/storyline → 423', async () => {
  const slug = await create('Kunci');
  const proj = await (await app.request(`/api/projects/${slug}`)).json();
  let putDuringPending = 0;
  const sub = subscribe(slug, (e) => {
    if (e.type === 'agent' && e.active) {
      void (async () => {
        putDuringPending = (await app.request(`/api/projects/${slug}`, json('PUT', proj))).status;
        agentLock.ack(slug, sub.clientId);
      })();
    }
  });
  await agentLock.beginOrExtend(slug);
  expect(putDuringPending).toBe(200);
  const r = await app.request(`/api/projects/${slug}`, json('PUT', proj));
  expect(r.status).toBe(423);
  expect(await r.json()).toEqual({ error: 'AI sedang mengedit project ini' });
  expect((await app.request(`/api/projects/${slug}/storyline`, json('PUT', { text: 'x' }))).status).toBe(423);
  expect((await app.request(`/api/projects/${slug}/archive`, json('POST', { archived: true }))).status).toBe(423);
  expect((await app.request(`/api/projects/${slug}/rename`, json('POST', { name: 'Y' }))).status).toBe(423);
  expect((await app.request(`/api/projects/${slug}`, { method: 'DELETE' })).status).toBe(423);
  const bulk = await (await app.request('/api/projects/bulk', json('POST', { action: 'delete', slugs: [slug] }))).json();
  expect(bulk.failed).toEqual([slug]);
  sub.close();
});

test('idle → kunci lepas, klien menerima agent inactive, PUT kembali 200', async () => {
  const slug = await create('Idle');
  const proj = await (await app.request(`/api/projects/${slug}`)).json();
  const got: LiveEvent[] = [];
  const sub = subscribe(slug, (e) => got.push(e));
  await agentLock.beginOrExtend(slug);
  await sleep(400);
  expect(agentLock.state(slug)).toBe('none');
  expect(got.some((e) => e.type === 'agent' && !e.active)).toBe(true);
  expect((await app.request(`/api/projects/${slug}`, json('PUT', proj))).status).toBe(200);
  sub.close();
});

test('extend menunda idle; release langsung melepas', async () => {
  await agentLock.beginOrExtend('q');
  await sleep(200);
  await agentLock.beginOrExtend('q');
  await sleep(200);
  expect(agentLock.state('q')).toBe('active');
  agentLock.release('q');
  expect(agentLock.state('q')).toBe('none');
});

async function readEvents(res: Response, n: number): Promise<LiveEvent[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const out: LiveEvent[] = [];
  while (out.length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (line) out.push(JSON.parse(line.slice(5)));
    }
  }
  await reader.cancel();
  return out;
}

test('SSE: hello dengan clientId, lalu event publish; ack lewat HTTP', async () => {
  const slug = await create('Sse');
  const ac = new AbortController();
  const res = await app.request(`/api/projects/${slug}/events`, { signal: ac.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  setTimeout(() => publish(slug, { type: 'storyline', text: 'halo' }), 50);
  const [hello, ev] = await readEvents(res, 2);
  expect(hello).toMatchObject({ type: 'hello', agent: { active: false, since: null } });
  expect(typeof (hello as { clientId: string }).clientId).toBe('string');
  expect(ev).toEqual({ type: 'storyline', text: 'halo' });
  const ack = await app.request(`/api/projects/${slug}/agent-ack`, json('POST', { clientId: 'tidak-dikenal' }));
  expect(ack.status).toBe(200);
  ac.abort();
});

test('list project: agentActive true saat dikunci', async () => {
  const slug = await create('Daftar');
  await agentLock.beginOrExtend(slug);
  const r = await (await app.request('/api/projects')).json();
  expect(r.items.find((i: { slug: string }) => i.slug === slug).agentActive).toBe(true);
  agentLock.release(slug);
  expect((await (await app.request('/api/projects')).json()).items[0].agentActive).toBe(false);
});
