import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/server/app';

let home: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'sb-set-'));
  process.env.STORYBOARD_HOME = home;
  app = createApp();
});

const put = (body: unknown, headers: Record<string, string> = {}) =>
  app.request('/api/settings', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });

test('default: MCP mati, port 5179, semua tool aktif, log lengkap; folder dari STORYBOARD_HOME', async () => {
  const s = await (await app.request('/api/settings')).json();
  expect(s.mcp).toMatchObject({
    enabled: false,
    port: 5179,
    url: 'http://127.0.0.1:5179/mcp',
    lastCallAt: null,
    tools: {},
    lock: { idleSeconds: 10, ackSeconds: 3 },
    log: { enabled: true, payloads: true, maxEntries: 2000 },
  });
  expect(s.mcp.toolList).toHaveLength(20);
  expect(s.storage).toMatchObject({ dataRoot: home, fixedByEnv: true });
});

test('folder diatur STORYBOARD_HOME → ganti folder ditolak 409', async () => {
  const r = await app.request('/api/settings/storage', { method: 'PUT', body: JSON.stringify({ dataRoot: '/tmp/x' }), headers: { 'content-type': 'application/json' } });
  expect(r.status).toBe(409);
});

test('settings.json lama {mcp:{enabled}} tetap terbaca, sisanya default', async () => {
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ mcp: { enabled: true } }));
  const s = (await (await createApp().request('/api/settings')).json()).mcp;
  expect(s).toMatchObject({ enabled: true, port: 5179, lock: { idleSeconds: 10 } });
});

test('PUT parsial digabung dan tersimpan', async () => {
  expect((await put({ mcp: { enabled: true } })).status).toBe(200);
  const r = await put({ mcp: { lock: { idleSeconds: 30 }, tools: { export_pdf: false }, allowedHosts: ['Storyboard.Local'] } });
  expect(r.status).toBe(200);
  const saved = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).mcp;
  expect(saved).toMatchObject({ enabled: true, lock: { idleSeconds: 30, ackSeconds: 3 }, tools: { export_pdf: false }, allowedHosts: ['storyboard.local'] });
});

test('PUT di luar batas / tool tak dikenal / field asing → 400, file tidak berubah', async () => {
  await put({ mcp: { enabled: true } });
  const before = readFileSync(join(home, 'settings.json'), 'utf8');
  for (const bad of [{ mcp: { port: 80 } }, { mcp: { lock: { idleSeconds: 1 } } }, { mcp: { tools: { hapus_semua: false } } }, { mcp: { allowedHosts: ['evil.com/x'] } }, { mcp: { rahasia: 1 } }])
    expect((await put(bad)).status).toBe(400);
  expect(readFileSync(join(home, 'settings.json'), 'utf8')).toBe(before);
});

test('PUT body tidak valid → 400', async () => {
  expect((await put({ mcp: { enabled: 'ya' } })).status).toBe(400);
  expect((await put({})).status).toBe(400);
});

test('settings.json rusak → default, bukan 500', async () => {
  writeFileSync(join(home, 'settings.json'), '{oops');
  const r = await app.request('/api/settings');
  expect(r.status).toBe(200);
  expect((await r.json()).mcp.enabled).toBe(false);
});

test('PUT dari origin luar → 403', async () => {
  expect((await put({ mcp: { enabled: true } }, { origin: 'http://evil.com' })).status).toBe(403);
});
