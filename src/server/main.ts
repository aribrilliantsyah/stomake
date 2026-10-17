import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { closeBrowser } from './export';
import { startMcp } from './mcp/control';
import { mcpListener } from './mcp/route';
import { dataRoot } from './paths';

const port = Number(process.env.PORT ?? 5178);
// the desktop bundle ships the built web app next to the server; dev/start use ./dist
const dist = process.env.STORYBOARD_DIST ?? join(process.cwd(), 'dist');
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--serve-dist');
const staticDir = production && existsSync(join(dist, 'index.html')) ? dist : undefined;
const webUrl = process.env.STORYBOARD_WEB_URL ?? (staticDir ? `http://127.0.0.1:${port}` : 'http://localhost:5173');

const mcp = mcpListener(() => webUrl, () => `http://127.0.0.1:${port}`);
const app = createApp({ webUrl, staticDir, port, mcp });

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  console.log(`storyboard-maker  http://127.0.0.1:${port}${staticDir ? '' : '  (api; web di http://localhost:5173)'}`);
  console.log(`data: ${dataRoot()}`);
  void startMcp(mcp).then(() => {
    const st = mcp.status();
    console.log(st.listening ? `mcp: http://127.0.0.1:${st.port}/mcp` : `mcp: tidak jalan (${st.error})`);
  });
});

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    await closeBrowser();
    await mcp.close();
    server.close();
    process.exit(0);
  });
