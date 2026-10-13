import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Hono } from 'hono';
import { publish } from './live';
import mammoth from 'mammoth';
import { AssetError, listAssets, MIME, promoteClip, saveAssets } from './assets';
import { badRequest, checkSlug, type Ctx } from './http';
import { isSafeName, isValidSlug, libraryDir, projectAssetsDir, projectClipsDir } from './paths';
import { projectExists, writeStoryline } from './store';

async function filesFrom(form: FormData, key: string): Promise<{ name: string; data: Buffer }[]> {
  const out: { name: string; data: Buffer }[] = [];
  for (const v of form.getAll(key)) {
    if (typeof v === 'string') continue;
    out.push({ name: v.name.normalize('NFC'), data: Buffer.from(await v.arrayBuffer()) });
  }
  return out;
}

export function assetRoutes(): Hono {
  const r = new Hono();

  r.get('/api/assets', async (c) => {
    const slug = c.req.query('project');
    if (slug && (!isValidSlug(slug) || !projectExists(slug))) return badRequest(c, 'invalid project');
    return c.json(await listAssets(slug || undefined));
  });

  const upload = (scope: 'global' | 'project' | 'clip') => async (c: Ctx) => {
    if (scope !== 'global') {
      const err = checkSlug(c);
      if (err) return err;
    }
    const form = await c.req.formData().catch(() => null);
    if (!form) return badRequest(c, 'multipart required');
    const files = await filesFrom(form, 'files');
    if (!files.length) return badRequest(c, 'no files');
    try {
      return c.json(await saveAssets(scope, files, c.req.param('slug')));
    } catch (e) {
      if (e instanceof AssetError) return badRequest(c, e.message);
      throw e;
    }
  };
  r.post('/api/assets/global', upload('global'));
  r.post('/api/assets/project/:slug', upload('project'));
  r.post('/api/projects/:slug/clips', upload('clip'));
  r.post('/api/projects/:slug/clips/:name/promote', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const name = c.req.param('name');
    if (!isSafeName(name)) return badRequest(c, 'invalid name');
    const info = await promoteClip(c.req.param('slug'), name);
    return info ? c.json(info) : c.json({ error: 'not found' }, 404);
  });

  const serveFile = async (c: Ctx, dir: string, name: string) => {
    if (!isSafeName(name)) return badRequest(c, 'invalid name');
    const file = join(dir, name);
    if (!existsSync(file)) return c.json({ error: 'not found' }, 404);
    const type = MIME[extname(name).toLowerCase()] ?? 'application/octet-stream';
    return c.body(new Uint8Array(await readFile(file)), 200, { 'content-type': type, 'cache-control': 'no-cache' });
  };
  r.get('/files/global/:name', (c) => serveFile(c, libraryDir(), c.req.param('name')));
  r.get('/files/clip/:slug/:name', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return badRequest(c, 'invalid slug');
    return serveFile(c, projectClipsDir(slug), c.req.param('name'));
  });
  r.get('/files/project/:slug/:name', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return badRequest(c, 'invalid slug');
    return serveFile(c, projectAssetsDir(slug), c.req.param('name'));
  });

  r.post('/api/projects/:slug/storyline/import', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const form = await c.req.formData().catch(() => null);
    const [file] = form ? await filesFrom(form, 'file') : [];
    if (!file || !file.name.toLowerCase().endsWith('.docx')) return badRequest(c, '.docx file required');
    const { value } = await mammoth.extractRawText({ buffer: file.data });
    const text = value.replace(/\n{3,}/g, '\n\n').trim();
    await writeStoryline(c.req.param('slug'), text);
    publish(c.req.param('slug'), { type: 'storyline', text });
    return c.json({ text });
  });

  return r;
}
