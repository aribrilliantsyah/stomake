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

test('default: MCP mati, url port 5178, belum pernah dipanggil; folder dari STORYBOARD_HOME', async () => {
  const s = await (await app.request('/api/settings')).json();
  expect(s.mcp).toEqual({ enabled: false, url: 'http://127.0.0.1:5178/mcp', lastCallAt: null });
  expect(s.storage).toMatchObject({ dataRoot: home, fixedByEnv: true });
});

test('folder diatur STORYBOARD_HOME → ganti folder ditolak 409', async () => {
  const r = await app.request('/api/settings/storage', { method: 'PUT', body: JSON.stringify({ dataRoot: '/tmp/x' }), headers: { 'content-type': 'application/json' } });
  expect(r.status).toBe(409);
});

test('url mengikuti port yang diberikan ke createApp', async () => {
  const a = createApp({ port: 5199 });
  expect((await (await a.request('/api/settings')).json()).mcp.url).toBe('http://127.0.0.1:5199/mcp');
});

test('PUT menyalakan MCP dan tersimpan di settings.json', async () => {
  const r = await put({ mcp: { enabled: true } });
  expect(r.status).toBe(200);
  expect((await r.json()).mcp.enabled).toBe(true);
  expect(JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8'))).toEqual({ mcp: { enabled: true } });
  expect((await (await app.request('/api/settings')).json()).mcp.enabled).toBe(true);
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
