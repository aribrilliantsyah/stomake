import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { closeBrowser } from './export';
import { dataRoot } from './paths';

const port = Number(process.env.PORT ?? 5178);
const dist = join(process.cwd(), 'dist');
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--serve-dist');
const staticDir = production && existsSync(join(dist, 'index.html')) ? dist : undefined;
const webUrl = process.env.STORYBOARD_WEB_URL ?? (staticDir ? `http://127.0.0.1:${port}` : 'http://localhost:5173');

const app = createApp({ webUrl, staticDir });

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  console.log(`storyboard-maker  http://127.0.0.1:${port}${staticDir ? '' : '  (api; web di http://localhost:5173)'}`);
  console.log(`data: ${dataRoot()}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    await closeBrowser();
    server.close();
    process.exit(0);
  });
