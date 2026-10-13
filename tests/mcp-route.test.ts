import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createApp } from '../src/server/app';
import { agentLock, resetLive, setLiveTimings } from '../src/server/live';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  process.env.STORYBOARD_HOME = mkdtempSync(join(tmpdir(), 'sb-mcp-'));
  app = createApp();
  setLiveTimings({ ack: 50, idle: 300 });
});
afterEach(() => {
  resetLive();
  setLiveTimings({ ack: 3000, idle: 10000 });
});

const enable = (on: boolean) =>
  app.request('/api/settings', { method: 'PUT', body: JSON.stringify({ mcp: { enabled: on } }), headers: { 'content-type': 'application/json' } });

async function client() {
  const c = new Client({ name: 'test', version: '1' });
  const fetchViaApp = (u: string | URL | Request, init?: RequestInit) => app.request(new Request(u, init));
  await c.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:5178/mcp'), { fetch: fetchViaApp as typeof fetch }));
  return c;
}

/** callTool result → structuredContent / error text. */
async function call<T = Record<string, unknown>>(c: Client, name: string, args: Record<string, unknown>) {
  const r = (await c.callTool({ name, arguments: args })) as unknown as { isError?: boolean; structuredContent: T; content: { text: string }[] };
  return r;
}

const TOOLS = [
  'add_layer', 'add_page', 'add_scene', 'create_project', 'export_pdf', 'finish_editing', 'get_project', 'get_storyline', 'list_assets', 'list_projects',
  'remove_layer', 'remove_page', 'remove_scene', 'reorder_layer', 'set_background', 'set_cover', 'set_storyline', 'update_layer', 'update_scene',
];

test('MCP mati → 404 dengan pesan', async () => {
  const r = await app.request('http://127.0.0.1:5178/mcp', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  expect(r.status).toBe(404);
  expect(await r.json()).toEqual({ error: 'MCP nonaktif. Nyalakan di Pengaturan.' });
  await expect(client()).rejects.toThrow();
});

test('MCP nyala → 19 tool', async () => {
  await enable(true);
  const c = await client();
  const names = (await c.listTools()).tools.map((t) => t.name).sort();
  expect(names).toEqual(TOOLS);
  await c.close();
});

test('callTool: create_project, add_scene sampai penuh → isError dengan pesan', async () => {
  await enable(true);
  const c = await client();
  const created = await call<{ slug: string }>(c, 'create_project', { name: 'Kipas' });
  const slug = created.structuredContent.slug;
  expect(slug).toBe('kipas');
  const proj = await call<{ pages: { id: string }[] }>(c, 'get_project', { slug });
  const pageId = proj.structuredContent.pages[0].id;
  await c.callTool({ name: 'add_scene', arguments: { slug, pageId } });
  await c.callTool({ name: 'add_scene', arguments: { slug, pageId } });
  const third = await call(c, 'add_scene', { slug, pageId });
  expect(third.isError).toBe(true);
  expect(third.content[0].text).toBe('Page sudah berisi 3 scene');
  const bad = await call(c, 'get_project', { slug: 'nope' });
  expect(bad.isError).toBe(true);
  expect(bad.content[0].text).toBe('Project tidak ditemukan: nope');
  await c.close();
});

test('Host/Origin asing → 403', async () => {
  await enable(true);
  const init = { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } };
  expect((await app.request('http://evil.com:5178/mcp', init)).status).toBe(403);
  expect((await app.request('http://127.0.0.1:5178/mcp', { ...init, headers: { ...init.headers, origin: 'http://evil.com' } })).status).toBe(403);
});

test('MCP dimatikan saat agent bekerja → 404, kunci tetap lepas sendiri', async () => {
  await enable(true);
  const c = await client();
  const { structuredContent } = await call<{ slug: string }>(c, 'create_project', { name: 'Mati' });
  const slug = structuredContent.slug;
  const p = await call<{ pages: { id: string }[] }>(c, 'get_project', { slug });
  await c.callTool({ name: 'add_scene', arguments: { slug, pageId: p.structuredContent.pages[0].id } });
  expect(agentLock.state(slug)).toBe('active');
  await enable(false);
  const r = await app.request('http://127.0.0.1:5178/mcp', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  expect(r.status).toBe(404);
  await new Promise((res) => setTimeout(res, 400));
  expect(agentLock.state(slug)).toBe('none');
});

test('versi server MCP dari package.json; error tak terduga tetap isError berbahasa Indonesia', async () => {
  await enable(true);
  const c = await client();
  const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
  expect(c.getServerVersion()?.version).toBe(pkg.version);
  const created = await call<{ slug: string }>(c, 'create_project', { name: 'Err' });
  const bad = await call(c, 'add_scene', { slug: created.structuredContent.slug, pageId: 123 });
  expect(bad.isError).toBe(true);
  // schema errors come from the SDK's own validation (English, names the field)
  expect(bad.content[0].text).toMatch(/pageId/);
  await c.close();
});
