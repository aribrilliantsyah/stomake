import { Hono } from 'hono';
import { assetRoutes } from './assetRoutes';
import { badRequest, checkSlug } from './http';
import { ZodError } from 'zod';
import {
  createProjectOnDisk,
  listProjects,
  projectExists,
  readProject,
  readStoryline,
  saveProject,
  writeStoryline,
} from './store';

export function projectRoutes(): Hono {
  const r = new Hono();

  r.get('/api/projects', async (c) => c.json(await listProjects()));

  r.post('/api/projects', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return badRequest(c, 'name required');
    return c.json({ slug: await createProjectOnDisk(name) });
  });

  r.get('/api/projects/:slug', async (c) => checkSlug(c) ?? c.json(await readProject(c.req.param('slug'))));

  r.put('/api/projects/:slug', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const body = await c.req.json().catch(() => null);
    try {
      return c.json({ updatedAt: await saveProject(c.req.param('slug'), body) });
    } catch (e) {
      if (e instanceof ZodError) return badRequest(c, e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      throw e;
    }
  });

  r.get('/api/projects/:slug/storyline', async (c) => checkSlug(c) ?? c.json({ text: await readStoryline(c.req.param('slug')) }));

  r.put('/api/projects/:slug/storyline', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof body.text !== 'string') return badRequest(c, 'text required');
    await writeStoryline(c.req.param('slug'), body.text);
    return c.json({ ok: true });
  });

  return r;
}

export function createApp(): Hono {
  const app = new Hono();
  app.route('/', projectRoutes());
  app.route('/', assetRoutes());
  app.onError((e, c) => {
    console.error(e);
    return c.json({ error: e.message }, 500);
  });
  return app;
}
