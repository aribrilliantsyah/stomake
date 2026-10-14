import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetInfo, AssetRef, Project } from '../shared/types';
import { info, uniqueName } from './assets';
import { dataRoot, isValidSlug, libraryDir, projectAssetsDir, projectDir } from './paths';
import { listAllProjects, readProject } from './store';

/**
 * Deleted assets go to ~/Storyboard/trash/assets/<id>/<file> + meta.json so the user can undo.
 * Layers that still point at a deleted asset render as "hilang: …" (existing behaviour) until restored.
 */
export function assetTrashDir(): string {
  return join(dataRoot(), 'trash', 'assets');
}

export function isValidAssetTrashId(id: string): boolean {
  return /^\d{13}-[a-z0-9]{6}$/.test(id);
}

interface Meta {
  scope: 'global' | 'project';
  slug?: string;
  name: string;
}

export async function trashAsset(scope: 'global' | 'project', name: string, slug?: string): Promise<string | null> {
  const dir = scope === 'global' ? libraryDir() : projectAssetsDir(slug!);
  const src = join(dir, name);
  if (!existsSync(src)) return null;
  const id = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const to = join(assetTrashDir(), id);
  await mkdir(to, { recursive: true });
  await writeFile(join(to, 'meta.json'), JSON.stringify({ scope, slug, name } satisfies Meta));
  await rename(src, join(to, name));
  return id;
}

/** Put it back under its old name, or "name (2).ext" if that name was taken meanwhile. */
export async function restoreAsset(id: string): Promise<AssetInfo | null> {
  const from = join(assetTrashDir(), id);
  if (!existsSync(join(from, 'meta.json'))) return null;
  const meta = JSON.parse(await readFile(join(from, 'meta.json'), 'utf8')) as Meta;
  if (meta.scope === 'project' && (!meta.slug || !isValidSlug(meta.slug) || !existsSync(projectDir(meta.slug)))) return null;
  const dir = meta.scope === 'global' ? libraryDir() : projectAssetsDir(meta.slug!);
  await mkdir(dir, { recursive: true });
  const name = uniqueName(dir, meta.name);
  await rename(join(from, meta.name), join(dir, name));
  await rm(from, { recursive: true, force: true });
  return info(meta.scope, dir, name, meta.slug);
}

function countRef(p: Project, ref: AssetRef): number {
  let n = 0;
  const bg = (b: Project['pageBackground'] | null) => (b?.kind === 'asset' && b.ref === ref ? 1 : 0);
  const panels = [...(p.cover ? [p.cover.panel] : []), ...p.pages.flatMap((pg) => pg.scenes.flatMap((s) => s.panels))];
  n += bg(p.pageBackground);
  for (const pg of p.pages) n += bg(pg.background);
  for (const pn of panels) {
    n += bg(pn.background);
    for (const l of pn.layers) if (l.type === 'image' && l.ref === ref) n++;
  }
  return n;
}

/** Where an asset is used: project assets only in their own project, global assets anywhere. */
export async function assetUsage(ref: AssetRef, slug?: string): Promise<{ slug: string; name: string; count: number }[]> {
  const slugs = ref.startsWith('project:') ? (slug ? [slug] : []) : (await listAllProjects()).filter((p) => !p.broken).map((p) => p.slug);
  const out: { slug: string; name: string; count: number }[] = [];
  for (const s of slugs) {
    try {
      const p = await readProject(s);
      const count = countRef(p, ref);
      if (count) out.push({ slug: s, name: p.name, count });
    } catch {
      /* broken project: skip */
    }
  }
  return out;
}
