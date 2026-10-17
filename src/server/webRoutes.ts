import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize } from 'node:path';
import { Hono } from 'hono';
import { exportPath, exportPdf, thumbStatus } from './export';
import { readProject } from './store';
import { checkSlug } from './http';
import { exportProjectZip, importProjectZip, ZipError } from './projectZip';

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
  r.get('/api/projects/:slug/thumb.png', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const slug = c.req.param('slug');
    try {
      const p = await readProject(slug);
      const t = thumbStatus(slug, webUrl(), p.cover ? -1 : 0);
      // 202 = not rendered yet; the client retries. Never hold the connection while Chromium renders.
      if (!t.file) return c.body(null, 202, { 'retry-after': '1', 'cache-control': 'no-store' });
      return c.body(new Uint8Array(await readFile(t.file)), 200, { 'content-type': 'image/png', 'cache-control': 'no-cache' });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });
  r.get('/api/projects/:slug/export.zip', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const { bytes, fileName } = await exportProjectZip(c.req.param('slug'));
    return c.body(bytes, 200, {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    });
  });
  // desktop: the native save dialog returns a path; the webview can't write files itself
  r.post('/api/projects/:slug/export.zip', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const body = (await c.req.json().catch(() => ({}))) as { path?: unknown };
    if (typeof body.path !== 'string' || !isAbsolute(body.path) || !body.path.toLowerCase().endsWith('.zip')) return c.json({ error: 'path .zip lengkap wajib diisi' }, 400);
    const { bytes } = await exportProjectZip(c.req.param('slug'));
    await writeFile(body.path, bytes);
    return c.json({ path: body.path });
  });
  r.post('/api/projects/import', async (c) => {
    const file = (await c.req.parseBody().catch(() => ({}) as Record<string, string | File>))['file'];
    if (!(file instanceof File)) return c.json({ error: 'file .zip wajib diisi' }, 400);
    try {
      return c.json({ slug: await importProjectZip(new Uint8Array(await file.arrayBuffer())) });
    } catch (e) {
      if (e instanceof ZipError) return c.json({ error: e.message }, 400);
      throw e;
    }
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
