import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { isMcpEnabled } from '../settings';
import { setExportBaseUrl, setPublicBase } from './ops';
import { buildMcpServer } from './server';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Streamable HTTP MCP endpoint, stateless: a fresh server + transport per request. */
export function mcpRoute(port: number, webUrl: () => string): Hono {
  const r = new Hono();
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  setPublicBase(`http://127.0.0.1:${port}`);
  r.all('/mcp', async (c) => {
    if (!(await isMcpEnabled())) return c.json({ error: 'MCP nonaktif. Nyalakan di Pengaturan.' }, 404);
    // DNS-rebinding / cross-site protection: local host header and (if sent) local origin only
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    if (!hosts.has(host)) return c.json({ error: 'host not allowed' }, 403);
    const origin = c.req.header('origin');
    if (origin && !LOCAL_ORIGIN.test(origin)) return c.json({ error: 'origin not allowed' }, 403);
    setExportBaseUrl(webUrl());
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await buildMcpServer().connect(transport);
    return transport.handleRequest(c.req.raw);
  });
  return r;
}
