import type { Context } from 'hono';
import { isValidSlug } from './paths';
import { projectExists } from './store';

export type Ctx = Context;

export function badRequest(c: Context, error: string) {
  return c.json({ error }, 400);
}

/** Returns an error response, or null when :slug is valid and exists. */
export function checkSlug(c: Context): Response | null {
  const slug = c.req.param('slug') ?? '';
  if (!isValidSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
  if (!projectExists(slug)) return c.json({ error: 'project not found' }, 404);
  return null;
}
