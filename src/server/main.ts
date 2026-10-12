import { serve } from '@hono/node-server';
import { createApp } from './app';
import { dataRoot } from './paths';

const port = Number(process.env.PORT ?? 5178);
const app = createApp();

serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  console.log(`storyboard-maker server http://127.0.0.1:${port}  data: ${dataRoot()}`);
});
