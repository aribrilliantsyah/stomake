import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Hono } from 'hono';
import { exportPath, exportPdf } from './export';
import { checkSlug } from './http';

export function exportRoutes(webUrl: () => string): Hono {
  const r = new Hono();
  r.post('/api/projects/:slug/export', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    try {
      return c.json(await exportPdf(c.req.param('slug'), webUrl()));
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });
  r.get('/api/projects/:slug/export.pdf', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const file = exportPath(c.req.param('slug'));
    if (!existsSync(file)) return c.json({ error: 'belum ada export' }, 404);
    return c.body(new Uint8Array(await readFile(file)), 200, {
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="storyboard.pdf"',
      'cache-control': 'no-cache',
    });
  });
  return r;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Serves the built SPA; unknown paths fall back to index.html. */
export function staticRoutes(dir: string): Hono {
  const r = new Hono();
  r.get('*', async (c) => {
    let path: string;
    try {
      path = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.json({ error: 'bad url' }, 400);
    }
    const rel = normalize(path).replace(/^([/\\])+/, '');
    let file = join(dir, rel);
    if (!file.startsWith(dir) || !existsSync(file) || rel === '' || !extname(file)) file = join(dir, 'index.html');
    return c.body(new Uint8Array(await readFile(file)), 200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  });
  return r;
}
