import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { assetRoutes } from './assetRoutes';
import { exportRoutes, staticRoutes } from './webRoutes';
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

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** CSRF guard: writes must come from a local origin; JSON bodies must declare JSON (forces a CORS preflight). */
export const guardWrites: MiddlewareHandler = async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
  const origin = c.req.header('origin');
  if (origin && !LOCAL_ORIGIN.test(origin)) return c.json({ error: 'origin not allowed' }, 403);
  const type = c.req.header('content-type') ?? '';
  const isMultipart = type.startsWith('multipart/form-data');
  if (isMultipart && !origin && c.req.header('sec-fetch-site') === 'cross-site') return c.json({ error: 'cross-site' }, 403);
  const hasBody = c.req.header('content-length') !== '0' && (type !== '' || c.req.method === 'PUT');
  if (hasBody && !isMultipart && !type.startsWith('application/json')) return c.json({ error: 'content-type must be application/json' }, 415);
  return next();
};

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

  const putStoryline = async (c: Context) => {
    const err = checkSlug(c);
    if (err) return err;
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof body.text !== 'string') return badRequest(c, 'text required');
    await writeStoryline(c.req.param('slug')!, body.text);
    return c.json({ ok: true });
  };
  r.put('/api/projects/:slug/storyline', putStoryline);
  r.post('/api/projects/:slug/storyline', putStoryline); // navigator.sendBeacon on tab close

  return r;
}

export interface AppOptions {
  /** URL Chromium opens to render /print/:slug. */
  webUrl?: string;
  /** Serve built web app from this folder (production). */
  staticDir?: string;
}

export function createApp(opts: AppOptions = {}): Hono {
  const app = new Hono();
  app.use('*', guardWrites);
  app.route('/', projectRoutes());
  app.route('/', assetRoutes());
  app.route('/', exportRoutes(() => opts.webUrl || process.env.STORYBOARD_WEB_URL || 'http://localhost:5173'));
  if (opts.staticDir) app.route('/', staticRoutes(opts.staticDir));
  app.onError((e, c) => {
    console.error(e);
    return c.json({ error: e.message }, 500);
  });
  return app;
}
