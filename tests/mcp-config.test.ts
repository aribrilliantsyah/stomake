import { createServer, type Server } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Hono } from 'hono';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { McpLogPage } from '../src/shared/types';
import { createApp } from '../src/server/app';
import { agentLock, resetLive, setLiveTimings } from '../src/server/live';
import { startMcp } from '../src/server/mcp/control';
import { mcpListener, type McpListener } from '../src/server/mcp/route';

let home: string;
let app: Hono;
let mcp: McpListener;

/** a port that is free right now */
function freePort(): Promise<number> {
  return new Promise((res) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });
}
function hold(port: number): Promise<Server> {
  return new Promise((res) => {
    const s = createServer().listen(port, '127.0.0.1', () => res(s));
  });
}

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'sb-mcpcfg-'));
  process.env.STORYBOARD_HOME = home;
  delete process.env.STORYBOARD_MCP_PORT;
  mcp = mcpListener(() => 'http://localhost:5173', () => 'http://127.0.0.1:5178');
  app = createApp({ mcp });
});
afterEach(async () => {
  await mcp.close();
  resetLive();
  setLiveTimings({ ack: 3000, idle: 10000 });
  delete process.env.STORYBOARD_MCP_PORT;
});

const put = (body: unknown) => app.request('/api/settings', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const settings = async () => (await (await app.request('/api/settings')).json()).mcp;
async function connect(port: number) {
  const c = new Client({ name: 'cfg-test', version: '9' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  return c;
}
const logs = async (q = '') => (await (await app.request(`/api/mcp/logs${q}`)).json()) as McpLogPage;

test('listener di port dari setelan; ganti port tanpa restart, port lama ditutup', async () => {
  const a = await freePort();
  await put({ mcp: { enabled: true, port: a } });
  await startMcp(mcp);
  expect(await settings()).toMatchObject({ listening: true, port: a, url: `http://127.0.0.1:${a}/mcp` });
  let c = await connect(a);
  expect((await c.listTools()).tools.length).toBe(20);
  await c.close();

  const b = await freePort();
  expect((await put({ mcp: { port: b } })).status).toBe(200);
  expect((await settings()).url).toBe(`http://127.0.0.1:${b}/mcp`);
  c = await connect(b);
  await c.close();
  await expect(fetch(`http://127.0.0.1:${a}/mcp`, { method: 'POST' })).rejects.toThrow();
});

test('port sudah dipakai program lain → 409, setelan dan listener lama tetap', async () => {
  const a = await freePort();
  await put({ mcp: { enabled: true, port: a } });
  await startMcp(mcp);
  const busy = await freePort();
  const blocker = await hold(busy);
  const r = await put({ mcp: { port: busy } });
  blocker.close();
  expect(r.status).toBe(409);
  expect((await r.json()).error).toContain(`Port ${busy} sudah dipakai`);
  expect(JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).mcp.port).toBe(a);
  expect(await settings()).toMatchObject({ port: a, listening: true });
});

test('STORYBOARD_MCP_PORT menimpa setelan dan ditandai portFromEnv', async () => {
  const p = await freePort();
  process.env.STORYBOARD_MCP_PORT = String(p);
  await startMcp(mcp);
  expect(await settings()).toMatchObject({ portFromEnv: true, url: `http://127.0.0.1:${p}/mcp`, listening: true });
});

test('tool yang dimatikan tidak muncul di tools/list dan panggilannya tercatat sebagai error', async () => {
  const p = await freePort();
  await put({ mcp: { enabled: true, port: p, tools: { export_pdf: false, remove_page: false } } });
  await startMcp(mcp);
  const c = await connect(p);
  const names = (await c.listTools()).tools.map((t) => t.name);
  expect(names).toHaveLength(18);
  expect(names).not.toContain('export_pdf');
  const r = (await c.callTool({ name: 'export_pdf', arguments: { slug: 'x' } })) as { isError?: boolean };
  expect(r.isError).toBe(true);
  await c.close();
  const page = await logs('?tool=export_pdf');
  expect(page.items[0]).toMatchObject({ kind: 'call', status: 'error', error: 'Tool export_pdf dimatikan di Pengaturan' });
});

test('log: init/list/call tercatat dengan client, input, output, durasi; filter dan pencarian', async () => {
  const p = await freePort();
  await put({ mcp: { enabled: true, port: p } });
  await startMcp(mcp);
  const c = await connect(p);
  await c.listTools();
  await c.callTool({ name: 'create_project', arguments: { name: 'Log Satu' } });
  await c.callTool({ name: 'get_project', arguments: { slug: 'tidak-ada' } });
  await c.close();

  const all = await logs();
  expect(all.items.map((e) => e.kind)).toEqual(['call', 'call', 'list', 'init']); // newest first
  const [bad, created] = all.items;
  expect(created).toMatchObject({ tool: 'create_project', status: 'ok', client: 'cfg-test 9', input: { name: 'Log Satu' }, output: { slug: 'log-satu' } });
  expect(bad).toMatchObject({ tool: 'get_project', slug: 'tidak-ada', status: 'error', error: 'Project tidak ditemukan: tidak-ada' });
  expect(typeof created.ms).toBe('number');
  expect(all.tools).toEqual(['create_project', 'get_project']);

  expect((await logs('?status=error')).items.map((e) => e.tool)).toEqual(['get_project']);
  expect((await logs('?kind=list')).total).toBe(1);
  expect((await logs('?q=log-satu')).items.map((e) => e.tool)).toEqual(['create_project']);
  expect((await logs(`?since=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`)).total).toBe(0);

  // survives a restart: read back from logs/mcp.jsonl
  const lines = readFileSync(join(home, 'logs', 'mcp.jsonl'), 'utf8').trim().split('\n');
  expect(lines).toHaveLength(4);
  const exp = await (await app.request('/api/mcp/logs/export?status=error')).text();
  expect(exp.trim().split('\n').map((l) => JSON.parse(l).tool)).toEqual(['get_project']);

  expect((await app.request('/api/mcp/logs', { method: 'DELETE' })).status).toBe(200);
  expect((await logs()).total).toBe(0);
  expect(readFileSync(join(home, 'logs', 'mcp.jsonl'), 'utf8')).toBe('');
});

test('log: MCP mati / host asing tercatat sebagai rejected; payload bisa dimatikan; string panjang dipotong', async () => {
  const p = await freePort();
  await put({ mcp: { port: p } });
  await startMcp(mcp);
  await fetch(`http://127.0.0.1:${p}/mcp`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  expect((await logs()).items[0]).toMatchObject({ kind: 'rejected', error: 'MCP nonaktif. Nyalakan di Pengaturan.' });

  await put({ mcp: { enabled: true, log: { payloads: false } } });
  const c = await connect(p);
  await c.callTool({ name: 'create_project', arguments: { name: 'Tanpa Isi' } });
  await c.close();
  const noPayload = (await logs('?tool=create_project')).items[0];
  expect(noPayload.input).toBeUndefined();
  expect(noPayload.output).toBeUndefined();

  await put({ mcp: { log: { payloads: true } } });
  const c2 = await connect(p);
  await c2.callTool({ name: 'set_storyline', arguments: { slug: 'tanpa-isi', text: 'x'.repeat(5000) } });
  await c2.close();
  const long = (await logs('?tool=set_storyline')).items[0].input as { text: string };
  expect(long.text.length).toBeLessThan(2100);
  expect(long.text).toContain('+3000 karakter');
});

test('log mati → tidak ada yang tercatat; maxEntries membatasi jumlah', async () => {
  const p = await freePort();
  await put({ mcp: { enabled: true, port: p, log: { enabled: false } } });
  await startMcp(mcp);
  const c = await connect(p);
  await c.listTools();
  expect((await logs()).total).toBe(0);
  await put({ mcp: { log: { enabled: true, maxEntries: 100 } } });
  for (let i = 0; i < 105; i++) await c.listTools();
  await c.close();
  expect((await logs()).total).toBe(100);
});

test('waktu lepas kunci dari setelan dipakai', async () => {
  const p = await freePort();
  await put({ mcp: { enabled: true, port: p, lock: { idleSeconds: 3, ackSeconds: 1 } } });
  await startMcp(mcp);
  const c = await connect(p);
  const created = (await c.callTool({ name: 'create_project', arguments: { name: 'Kunci' } })).structuredContent as { slug: string };
  const proj = (await c.callTool({ name: 'get_project', arguments: { slug: created.slug } })).structuredContent as { pages: { id: string }[] };
  await c.callTool({ name: 'add_scene', arguments: { slug: created.slug, pageId: proj.pages[0].id } });
  await c.close();
  expect(agentLock.state(created.slug)).toBe('active');
  // switching MCP off mid-work must not strand the lock
  await put({ mcp: { enabled: false } });
  // real lock timer: idle release is a wall-clock timeout by design
  await new Promise((r) => setTimeout(r, 3200));
  expect(agentLock.state(created.slug)).toBe('none');
}, 10_000);
