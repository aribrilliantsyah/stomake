import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { z } from 'zod';
import type { McpSettings } from '../../shared/types';
import { readSettings } from '../settings';
import { recordMcp } from './log';
import { setExportBaseUrl, setPublicBase } from './ops';
import { buildMcpServer } from './server';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** the fields of one JSON-RPC request the log needs; anything else (batches, junk) parses to {} */
const rpcSchema = z
  .object({
    method: z.string().optional(),
    params: z
      .object({
        name: z.string().optional(),
        arguments: z.record(z.string(), z.unknown()).optional(),
        clientInfo: z.object({ name: z.string(), version: z.string().optional() }).optional(),
      })
      .optional(),
  })
  .catch({});

/**
 * Stateless HTTP: `initialize` (with clientInfo) and later calls arrive as separate requests.
 * Remember the agent's own name per User-Agent so tools/call entries show it too.
 */
const clientByUa = new Map<string, string>();

/**
 * Streamable HTTP MCP endpoint, stateless: a fresh server + transport per request.
 * `port` is the listener's own port (Host header check); `webUrl` is where Chromium prints PDFs from.
 */
export function mcpRoute(port: () => number, webUrl: () => string, appUrl: () => string): Hono {
  const r = new Hono();
  r.all('/mcp', async (c) => {
    const t0 = performance.now();
    const ua = c.req.header('user-agent') ?? null;
    const ms = () => Math.round(performance.now() - t0);
    const s: McpSettings = (await readSettings()).mcp;
    const reject = (status: 403 | 404, error: string) => {
      recordMcp({ kind: 'rejected', tool: null, slug: null, status: 'error', ms: ms(), client: ua, error });
      return c.json({ error }, status);
    };
    if (!s.enabled) return reject(404, 'MCP nonaktif. Nyalakan di Pengaturan.');
    // DNS-rebinding / cross-site protection: local host header and (if sent) local origin only
    const host = (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase();
    const p = port();
    const hosts = new Set(['127.0.0.1', 'localhost', ...s.allowedHosts].map((h) => `${h}:${p}`));
    if (!hosts.has(host)) return reject(403, `host not allowed: ${host}`);
    const origin = c.req.header('origin');
    if (origin && !LOCAL_ORIGIN.test(origin)) return reject(403, `origin not allowed: ${origin}`);

    setExportBaseUrl(webUrl());
    setPublicBase(appUrl());
    const req = c.req.raw;
    const rpc = rpcSchema.parse(req.method === 'POST' ? await req.clone().json().catch(() => null) : null);
    const method = rpc.method;
    const tool = method === 'tools/call' ? rpc.params?.name : undefined;
    const args = rpc.params?.arguments;
    const info = rpc.params?.clientInfo;
    const named = info ? `${info.name}${info.version ? ` ${info.version}` : ''}` : null;
    if (named && ua) clientByUa.set(ua, named);
    const client = named ?? (ua ? (clientByUa.get(ua) ?? ua) : null);
    const allowed = (name: string) => s.tools[name] !== false;
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await buildMcpServer({ allowed, client }).connect(transport);
    const res = await transport.handleRequest(req);

    // tools/call is logged by the tool handler itself; log everything else here
    if (method === 'tools/call' && tool && allowed(tool)) return res;
    if (!method || method.startsWith('notifications/')) return res; // GET/DELETE probes, notifications
    const kind = method === 'initialize' ? 'init' : method === 'tools/list' ? 'list' : method === 'tools/call' ? 'call' : 'other';
    const disabled = method === 'tools/call' && tool ? `Tool ${tool} dimatikan di Pengaturan` : undefined;
    recordMcp({
      kind,
      tool: tool ?? null,
      slug: typeof args?.slug === 'string' ? args.slug : null,
      status: disabled || !res.ok ? 'error' : 'ok',
      ms: ms(),
      client,
      input: method === 'tools/call' ? args : { method },
      error: disabled ?? (res.ok ? undefined : `HTTP ${res.status}`),
    });
    return res;
  });
  return r;
}

export interface McpListener {
  /** opens (or moves to) a port; resolves once listening, rejects when the port is taken */
  listen(port: number): Promise<void>;
  close(): Promise<void>;
  status(): { port: number; listening: boolean; error: string | null };
}

/** Separate 127.0.0.1 server for MCP so its URL stays fixed even when the app's own port moves. */
export function mcpListener(webUrl: () => string, appUrl: () => string): McpListener {
  let server: ServerType | null = null;
  let current = 0;
  let error: string | null = null;
  const app = new Hono();
  app.route('/', mcpRoute(() => current, webUrl, appUrl));
  app.all('*', (c) => c.json({ error: 'not found' }, 404));

  const open = (port: number) =>
    new Promise<ServerType>((resolve, reject) => {
      const s = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => resolve(s));
      s.once('error', (e: NodeJS.ErrnoException) => reject(new Error(e.code === 'EADDRINUSE' ? `Port ${port} sudah dipakai program lain` : e.message)));
    });
  const shut = (s: ServerType) => new Promise<void>((res) => s.close(() => res()));

  return {
    async listen(port) {
      if (server && current === port) return;
      let next: ServerType;
      try {
        next = await open(port);
      } catch (e) {
        error = (e as Error).message;
        throw e;
      }
      const prev = server;
      server = next;
      current = (next.address() as AddressInfo).port;
      error = null;
      if (prev) await shut(prev);
    },
    async close() {
      if (server) await shut(server);
      server = null;
    },
    status: () => ({ port: current, listening: !!server, error }),
  };
}
