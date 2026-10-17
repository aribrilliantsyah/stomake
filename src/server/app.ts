import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { assetRoutes } from './assetRoutes';
import { exportRoutes, staticRoutes } from './webRoutes';
import { badRequest, checkSlug } from './http';
import { ZodError } from 'zod';
import {
  createProjectOnDisk,
  duplicateProject,
  projectExists,
  queryProjects,
  readProject,
  readStoryline,
  renameProject,
  restoreFromTrash,
  saveProject,
  setArchived,
  trashExists,
  trashProject,
  writeStoryline,
  LockedError,
  ConflictError,
} from './store';
import { dataRoot, defaultDataRoot, isValidSlug, isValidTrashId, setDataRoot } from './paths';
import type { ProjectSort, ProjectStatus, SettingsView } from '../shared/types';
import { agentLock, LOCKED_MESSAGE, subscribe } from './live';
import { applyRuntime, envMcpPort, mcpLogRoutes, startMcp } from './mcp/control';
import type { McpListener } from './mcp/route';
import { TOOLS } from './mcp/server';
import { streamSSE } from 'hono/streaming';
import { lastMcpCallAt, mergeSettings, readSettings, settingsPatchSchema, writeSettings } from './settings';

const SORTS: ProjectSort[] = ['updated', 'name', 'created', 'scenes'];
const STATUSES: ProjectStatus[] = ['active', 'archived', 'all'];

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

const locked = (c: Context) => c.json({ error: LOCKED_MESSAGE }, 423);

export function projectRoutes(): Hono {
  const r = new Hono();

  // editor writes are refused while an agent holds the project
  for (const path of ['/api/projects/:slug', '/api/projects/:slug/storyline', '/api/projects/:slug/storyline/import', '/api/projects/:slug/archive', '/api/projects/:slug/rename'])
    r.on(['PUT', 'POST', 'DELETE'], path, async (c, next) => {
      const slug = c.req.param('slug');
      if (slug && agentLock.blocksEditor(slug)) return locked(c);
      return next();
    });

  r.get('/api/projects/:slug/events', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const slug = c.req.param('slug');
    return streamSSE(c, async (stream) => {
      const queue: string[] = [];
      let wake: (() => void) | null = null;
      const sub = subscribe(slug, (e) => {
        queue.push(JSON.stringify(e));
        wake?.();
      });
      let open = true;
      stream.onAbort(() => {
        open = false;
        sub.close();
        wake?.();
      });
      const st = agentLock.state(slug);
      const updatedAt = await readProject(slug).then((p) => p.updatedAt, () => null);
      await stream.writeSSE({ data: JSON.stringify({ type: 'hello', clientId: sub.clientId, updatedAt, agent: { active: st !== 'none', since: agentLock.since(slug) } }) });
      while (open) {
        while (queue.length) await stream.writeSSE({ data: queue.shift()! });
        await new Promise<void>((res) => {
          const t = setTimeout(res, 15000);
          wake = () => {
            clearTimeout(t);
            res();
          };
        });
        wake = null;
        if (open && !queue.length) await stream.write(': ping\n\n');
      }
    });
  });

  r.post('/api/projects/:slug/agent-ack', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { clientId?: unknown };
    if (typeof body.clientId === 'string') agentLock.ack(c.req.param('slug'), body.clientId);
    return c.json({ ok: true });
  });

  r.get('/api/projects', async (c) => {
    const q = c.req.query();
    const num = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));
    return c.json(
      await queryProjects({
        q: q.q,
        status: STATUSES.includes(q.status as ProjectStatus) ? (q.status as ProjectStatus) : 'active',
        sort: SORTS.includes(q.sort as ProjectSort) ? (q.sort as ProjectSort) : 'updated',
        since: num(q.since),
        page: num(q.page),
        size: num(q.size),
      }),
    );
  });

  r.post('/api/projects/bulk', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { action?: unknown; slugs?: unknown };
    const action = body.action;
    if (!['archive', 'unarchive', 'delete'].includes(action as string) || !Array.isArray(body.slugs)) return badRequest(c, 'action/slugs');
    const ok: string[] = [];
    const failed: string[] = [];
    const trashIds: string[] = [];
    for (const s of body.slugs.slice(0, 500)) {
      if (typeof s !== 'string' || !isValidSlug(s) || !projectExists(s) || agentLock.blocksEditor(s)) {
        failed.push(String(s));
        continue;
      }
      try {
        if (action === 'delete') trashIds.push(await trashProject(s));
        else await setArchived(s, action === 'archive');
        ok.push(s);
      } catch {
        failed.push(s);
      }
    }
    return c.json(action === 'delete' ? { ok, failed, trashIds } : { ok, failed });
  });

  r.post('/api/projects/:slug/archive', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const body = (await c.req.json().catch(() => ({}))) as { archived?: unknown };
    if (typeof body.archived !== 'boolean') return badRequest(c, 'archived required');
    await setArchived(c.req.param('slug'), body.archived);
    return c.json({ ok: true });
  });

  r.post('/api/projects/:slug/rename', async (c) => {
    const err = checkSlug(c);
    if (err) return err;
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 120) return badRequest(c, 'name required');
    await renameProject(c.req.param('slug'), name);
    return c.json({ slug: c.req.param('slug'), name });
  });

  r.post('/api/projects/:slug/duplicate', async (c) => checkSlug(c) ?? c.json({ slug: await duplicateProject(c.req.param('slug')) }));

  r.delete('/api/projects/:slug', async (c) => checkSlug(c) ?? c.json({ trashId: await trashProject(c.req.param('slug')) }));

  r.post('/api/trash/:id/restore', async (c) => {
    const id = c.req.param('id');
    if (!isValidTrashId(id)) return badRequest(c, 'invalid trash id');
    if (!trashExists(id)) return c.json({ error: 'not found' }, 404);
    return c.json({ slug: await restoreFromTrash(id) });
  });

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
  /** Port the app itself listens on (PDF links returned to agents). */
  port?: number;
  /** The MCP listener; settings changes move it. Absent in tests that don't open sockets. */
  mcp?: McpListener;
}

function settingsRoutes(opts: AppOptions): Hono {
  const r = new Hono();
  const view = async (): Promise<SettingsView> => {
    const s = (await readSettings()).mcp;
    const st = opts.mcp?.status();
    const port = envMcpPort() ?? (st?.listening ? st.port : s.port);
    return {
      mcp: {
        ...s,
        url: `http://127.0.0.1:${port}/mcp`,
        listening: !!st?.listening,
        listenError: st?.error ?? null,
        lastCallAt: lastMcpCallAt(),
        portFromEnv: envMcpPort() !== null,
        toolList: TOOLS,
      },
      storage: { dataRoot: dataRoot(), defaultRoot: defaultDataRoot(), fixedByEnv: process.env.STORYBOARD_HOME !== undefined },
    };
  };
  r.get('/api/settings', async (c) => c.json(await view()));
  r.put('/api/settings', async (c) => {
    const patch = settingsPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!patch.success) return badRequest(c, 'settings tidak valid');
    if (patch.data.mcp.tools && Object.keys(patch.data.mcp.tools).some((t) => !TOOLS.some((x) => x.name === t))) return badRequest(c, 'nama tool tidak dikenal');
    let next;
    try {
      next = mergeSettings(await readSettings(), patch.data);
    } catch (e) {
      if (e instanceof ZodError) return badRequest(c, e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      throw e;
    }
    // move the listener first: a taken port must not end up saved
    if (opts.mcp && envMcpPort() === null && next.mcp.port !== opts.mcp.status().port) {
      try {
        await opts.mcp.listen(next.mcp.port);
      } catch (e) {
        return c.json({ error: (e as Error).message }, 409);
      }
    }
    await writeSettings(next);
    applyRuntime(next);
    return c.json(await view());
  });
  r.put('/api/settings/storage', async (c) => {
    if (process.env.STORYBOARD_HOME !== undefined) return c.json({ error: 'Folder diatur oleh STORYBOARD_HOME' }, 409);
    const body = (await c.req.json().catch(() => ({}))) as { dataRoot?: unknown };
    if (typeof body.dataRoot !== 'string' || !body.dataRoot.trim()) return badRequest(c, 'dataRoot wajib diisi');
    if (agentLock.anyActive()) return c.json({ error: LOCKED_MESSAGE }, 423);
    try {
      setDataRoot(body.dataRoot.trim());
    } catch (e) {
      return badRequest(c, (e as Error).message);
    }
    // settings.json lives in the data folder: the new folder may configure MCP differently
    if (opts.mcp) await startMcp(opts.mcp);
    else applyRuntime(await readSettings());
    return c.json(await view());
  });
  return r;
}

export function createApp(opts: AppOptions = {}): Hono {
  const app = new Hono();
  const webUrl = () => opts.webUrl || process.env.STORYBOARD_WEB_URL || 'http://localhost:5173';
  app.use('*', guardWrites);
  app.route('/', settingsRoutes(opts));
  app.route('/', mcpLogRoutes());
  app.route('/', projectRoutes());
  app.route('/', assetRoutes());
  app.route('/', exportRoutes(webUrl));
  if (opts.staticDir) app.route('/', staticRoutes(opts.staticDir));
  app.onError((e, c) => {
    if (e instanceof LockedError) return c.json({ error: e.message }, 423);
    if (e instanceof ConflictError) return c.json({ error: e.message }, 409);
    console.error(e);
    return c.json({ error: e.message }, 500);
  });
  return app;
}
