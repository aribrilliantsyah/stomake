import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { McpLogEntry, Settings } from '../../shared/types';
import { setLiveTimings } from '../live';
import { readSettings } from '../settings';
import { clearMcpLog, configureMcpLog, exportMcpLog, queryMcpLog, subscribeMcpLog, type McpLogQuery } from './log';
import type { McpListener } from './route';

/** STORYBOARD_MCP_PORT pins the port (tests/e2e, or a user who wants it fixed outside the app). */
export function envMcpPort(): number | null {
  const v = Number(process.env.STORYBOARD_MCP_PORT);
  return Number.isInteger(v) && v > 0 ? v : null;
}

/** Applies the parts of settings that live in memory (log config, lock timings). The listener port is applied by the caller. */
export function applyRuntime(s: Settings): void {
  configureMcpLog(s.mcp.log);
  setLiveTimings({ ack: s.mcp.lock.ackSeconds * 1000, idle: s.mcp.lock.idleSeconds * 1000 });
}

/** Opens the listener on the configured (or env) port and applies runtime settings. Never throws; errors show in status. */
export async function startMcp(listener: McpListener): Promise<void> {
  const s = await readSettings();
  applyRuntime(s);
  await listener.listen(envMcpPort() ?? s.mcp.port).catch((e) => console.warn(`MCP listener: ${(e as Error).message}`));
}

const KINDS: McpLogEntry['kind'][] = ['call', 'list', 'init', 'rejected', 'other'];

function queryFrom(q: Record<string, string | undefined>): McpLogQuery {
  const iso = (v: string | undefined) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
  return {
    q: q.q?.trim() || undefined,
    tool: q.tool || undefined,
    status: q.status === 'ok' || q.status === 'error' ? q.status : undefined,
    kind: KINDS.includes(q.kind as McpLogEntry['kind']) ? (q.kind as McpLogEntry['kind']) : undefined,
    slug: q.slug || undefined,
    since: iso(q.since),
    before: iso(q.before),
    limit: q.limit ? Number(q.limit) : undefined,
  };
}

/** /api/mcp/logs: query, export, clear, live stream. */
export function mcpLogRoutes(): Hono {
  const r = new Hono();
  r.get('/api/mcp/logs', (c) => c.json(queryMcpLog(queryFrom(c.req.query()))));
  r.get('/api/mcp/logs/export', (c) => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return c.body(exportMcpLog(queryFrom(c.req.query())), 200, {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'content-disposition': `attachment; filename="mcp-log-${stamp}.jsonl"`,
    });
  });
  r.delete('/api/mcp/logs', (c) => {
    clearMcpLog();
    return c.json({ ok: true });
  });
  r.get('/api/mcp/logs/events', (c) =>
    streamSSE(c, async (stream) => {
      const off = subscribeMcpLog((e) => void stream.writeSSE({ data: JSON.stringify(e) }));
      stream.onAbort(off);
      while (!stream.aborted) {
        await stream.sleep(15_000);
        await stream.write(': ping\n\n');
      }
      off();
    }),
  );
  return r;
}
