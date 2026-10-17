import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createProject } from '../shared/model';
import { parseProject } from '../shared/schema';
import type { Project, ProjectPage, ProjectQuery, ProjectSummary } from '../shared/types';
import { agentLock, withWriteLock } from './live';
import { isValidSlug, projectAssetsDir, projectDir, projectsDir, slugify, trashDir } from './paths';

async function writeAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, file);
}

const projectFile = (slug: string) => join(projectDir(slug), 'project.json');
const storylineFile = (slug: string) => join(projectDir(slug), 'storyline.txt');

export function projectExists(slug: string): boolean {
  return existsSync(projectFile(slug));
}

async function summarize(slug: string): Promise<ProjectSummary> {
  try {
    const p = JSON.parse(await readFile(projectFile(slug), 'utf8')) as Project;
    return {
      slug,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      pages: p.pages.length,
      scenes: p.pages.reduce((n, pg) => n + pg.scenes.length, 0),
      archived: !!p.archived,
      hasCover: !!p.cover,
      agentActive: agentLock.state(slug) !== 'none',
    };
  } catch {
    let at = new Date(0).toISOString();
    try {
      at = (await import('node:fs')).statSync(projectFile(slug)).mtime.toISOString();
    } catch {
      /* ignore */
    }
    return { slug, name: slug, createdAt: at, updatedAt: at, pages: 0, scenes: 0, archived: false, hasCover: false, agentActive: false, broken: true };
  }
}

/** All project folders (contain a project.json), summarized. */
export async function listAllProjects(): Promise<ProjectSummary[]> {
  if (!existsSync(projectsDir())) return [];
  const slugs = (await readdir(projectsDir())).filter((s) => isValidSlug(s) && existsSync(projectFile(s)));
  return Promise.all(slugs.map(summarize));
}

export const PAGE_SIZE_DEFAULT = 24;

export async function queryProjects(q: ProjectQuery = {}): Promise<ProjectPage> {
  const size = Math.max(1, Math.min(100, Math.floor(q.size ?? PAGE_SIZE_DEFAULT) || 1));
  const page = Math.max(1, Math.floor(q.page ?? 1) || 1);
  const status = q.status ?? 'active';
  const needle = (q.q ?? '').trim().toLowerCase();
  const since = q.since && q.since > 0 ? Date.now() - q.since * 86400e3 : null;
  let items = await listAllProjects();
  items = items.filter((p) => (status === 'all' ? true : status === 'archived' ? p.archived : !p.archived));
  if (needle) items = items.filter((p) => p.name.toLowerCase().includes(needle) || p.slug.includes(needle));
  if (since !== null) items = items.filter((p) => Date.parse(p.updatedAt) >= since);
  const byName = (a: ProjectSummary, b: ProjectSummary) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' });
  const cmp: Record<string, (a: ProjectSummary, b: ProjectSummary) => number> = {
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byName(a, b),
    created: (a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b),
    name: byName,
    scenes: (a, b) => b.scenes - a.scenes || byName(a, b),
  };
  items.sort(cmp[q.sort ?? 'updated'] ?? cmp.updated);
  return { items: items.slice((page - 1) * size, page * size), total: items.length, page, size };
}

/** @deprecated kept for callers that want everything */
export async function listProjects(): Promise<ProjectSummary[]> {
  return (await queryProjects({ status: 'all', size: 100 })).items;
}

export function uniqueSlug(base: string): string {
  let slug = base;
  for (let n = 2; existsSync(projectDir(slug)); n++) slug = `${base}-${n}`;
  return slug;
}

export async function createProjectOnDisk(name: string): Promise<string> {
  const slug = uniqueSlug(slugify(name) || 'project');
  await mkdir(projectAssetsDir(slug), { recursive: true });
  await mkdir(join(projectDir(slug), 'exports'), { recursive: true });
  const project = createProject(name.trim(), new Date().toISOString());
  await writeAtomic(projectFile(slug), JSON.stringify(project, null, 2));
  await writeFile(storylineFile(slug), '', 'utf8');
  return slug;
}

export async function readProject(slug: string): Promise<Project> {
  return parseProject(JSON.parse(await readFile(projectFile(slug), 'utf8')));
}

/** Editor write refused because an agent holds the project. */
export class LockedError extends Error {}
/** Editor write based on an older version than what is on disk. */
export class ConflictError extends Error {}

function assertEditorMayWrite(slug: string): void {
  if (agentLock.blocksEditor(slug)) throw new LockedError('AI sedang mengedit project ini');
}

/**
 * Editor save: validates, refuses while an agent holds the project and when the editor's
 * updatedAt is older than disk (someone else wrote meanwhile), stamps updatedAt, writes atomically.
 * Both checks run inside the per-slug write queue so they can't race an agent write.
 */
export async function saveProject(slug: string, body: unknown): Promise<string> {
  const project = parseProject(body);
  return withWriteLock(slug, async () => {
    assertEditorMayWrite(slug);
    const disk = await readProject(slug).catch(() => null);
    if (disk && Date.parse(disk.updatedAt) > Date.parse(project.updatedAt))
      throw new ConflictError('Project sudah diubah di tempat lain — muat ulang untuk melihat versi terbaru');
    let now = new Date().toISOString();
    if (now <= project.updatedAt) now = new Date(Date.parse(project.updatedAt) + 1).toISOString();
    project.updatedAt = now;
    await writeAtomic(projectFile(slug), JSON.stringify(project, null, 2));
    return now;
  });
}

/**
 * Read-modify-write under the slug's write lock. `fn` returns the new project
 * (updatedAt is stamped here) plus an arbitrary result. Throwing leaves the file untouched.
 */
export async function updateProjectOnDisk<R>(slug: string, fn: (p: Project) => { project: Project; result: R }): Promise<{ project: Project; result: R }> {
  return withWriteLock(slug, async () => {
    const cur = await readProject(slug);
    const out = fn(cur);
    const next = parseProject(out.project);
    let now = new Date().toISOString();
    if (now <= cur.updatedAt) now = new Date(Date.parse(cur.updatedAt) + 1).toISOString();
    next.updatedAt = now;
    await writeAtomic(projectFile(slug), JSON.stringify(next, null, 2));
    return { project: next, result: out.result };
  });
}

export async function readStoryline(slug: string): Promise<string> {
  try {
    return await readFile(storylineFile(slug), 'utf8');
  } catch {
    return '';
  }
}

export async function writeStoryline(slug: string, text: string, by: 'editor' | 'agent' = 'editor'): Promise<void> {
  await withWriteLock(slug, async () => {
    if (by === 'editor') assertEditorMayWrite(slug);
    await writeAtomic(storylineFile(slug), text);
  });
}

async function readRaw(slug: string): Promise<Project> {
  return readProject(slug);
}

async function writeProject(slug: string, p: Project): Promise<void> {
  await writeAtomic(projectFile(slug), JSON.stringify(p, null, 2));
}

async function modify(slug: string, fn: (p: Project) => Project): Promise<void> {
  await withWriteLock(slug, async () => {
    assertEditorMayWrite(slug);
    await writeProject(slug, fn(await readRaw(slug)));
  });
}

export async function setArchived(slug: string, archived: boolean): Promise<void> {
  await modify(slug, (p) => ({ ...p, archived }));
}

export async function renameProject(slug: string, name: string): Promise<void> {
  await modify(slug, (p) => ({ ...p, name, updatedAt: new Date().toISOString() }));
}

/** Copy a project to a new slug "<slug>-salinan": assets + storyline, not exports; active, fresh timestamps. */
export async function duplicateProject(slug: string): Promise<string> {
  const src = await readRaw(slug);
  const target = uniqueSlug(`${slug}-salinan`);
  const from = projectDir(slug);
  const to = projectDir(target);
  await mkdir(to, { recursive: true });
  await cp(join(from, 'assets'), join(to, 'assets'), { recursive: true }).catch(() => mkdir(join(to, 'assets'), { recursive: true }));
  await cp(join(from, 'clips'), join(to, 'clips'), { recursive: true }).catch(() => undefined);
  await mkdir(join(to, 'exports'), { recursive: true });
  await writeFile(join(to, 'storyline.txt'), await readStoryline(slug), 'utf8');
  const now = new Date().toISOString();
  await writeProject(target, { ...src, name: `${src.name} (salinan)`, archived: false, createdAt: now, updatedAt: now });
  return target;
}

/** Move a project folder to ~/Storyboard/trash/<slug>__<ms>. Returns the trash id. */
export async function trashProject(slug: string): Promise<string> {
  await mkdir(trashDir(), { recursive: true });
  let id = `${slug}__${Date.now()}`;
  while (existsSync(join(trashDir(), id))) id = `${slug}__${Date.now() + 1}`;
  await withWriteLock(slug, async () => {
    assertEditorMayWrite(slug);
    await rename(projectDir(slug), join(trashDir(), id));
  });
  return id;
}

export function trashExists(id: string): boolean {
  return existsSync(join(trashDir(), id, 'project.json'));
}

/** Move a trashed project back; uses a new slug if the old one was taken meanwhile. */
export async function restoreFromTrash(id: string): Promise<string> {
  const slug = uniqueSlug(id.slice(0, id.lastIndexOf('__')));
  await mkdir(projectsDir(), { recursive: true });
  await rename(join(trashDir(), id), projectDir(slug));
  return slug;
}

export async function purgeTrash(id: string): Promise<void> {
  await rm(join(trashDir(), id), { recursive: true, force: true });
}
