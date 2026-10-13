import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { imageSize } from 'image-size';
import type { AssetInfo, AssetRef } from '../shared/types';
import { hasAssetExt, isSafeName, libraryDir, projectAssetsDir, projectClipsDir } from './paths';

export const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export function uniqueName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name;
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length).trimEnd();
  for (let n = 2; ; n++) {
    const cand = `${base} (${n})${ext}`;
    if (!existsSync(join(dir, cand))) return cand;
  }
}

type Scope = 'global' | 'project' | 'clip';

function fileUrl(scope: Scope, name: string, slug?: string): string {
  const n = encodeURIComponent(name);
  return scope === 'global' ? `/files/global/${n}` : `/files/${scope}/${slug}/${n}`;
}

export async function info(scope: Scope, dir: string, name: string, slug?: string): Promise<AssetInfo | null> {
  try {
    const { width = 1, height = 1 } = imageSize(await readFile(join(dir, name)));
    return { ref: `${scope}:${name}` as AssetRef, name, width, height, url: fileUrl(scope, name, slug) };
  } catch {
    return null;
  }
}

async function listDir(scope: 'global' | 'project', dir: string, slug?: string): Promise<AssetInfo[]> {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((n) => isSafeName(n) && hasAssetExt(n)).sort((a, b) => a.localeCompare(b));
  const out = await Promise.all(names.map((n) => info(scope, dir, n, slug)));
  return out.filter((x): x is AssetInfo => x !== null);
}

export async function listAssets(slug?: string): Promise<{ project: AssetInfo[]; global: AssetInfo[] }> {
  return {
    project: slug ? await listDir('project', projectAssetsDir(slug), slug) : [],
    global: await listDir('global', libraryDir()),
  };
}

export class AssetError extends Error {}

export async function saveAssets(
  scope: Scope,
  files: { name: string; data: Buffer }[],
  slug?: string,
): Promise<AssetInfo[]> {
  const dir = scope === 'global' ? libraryDir() : scope === 'clip' ? projectClipsDir(slug!) : projectAssetsDir(slug!);
  for (const f of files) {
    if (!isSafeName(f.name)) throw new AssetError(`nama file tidak valid: ${f.name}`);
    if (!hasAssetExt(f.name)) throw new AssetError(`format tidak didukung: ${f.name}`);
  }
  await mkdir(dir, { recursive: true });
  const out: AssetInfo[] = [];
  for (const f of files) {
    const name = uniqueName(dir, f.name);
    await writeFile(join(dir, name), f.data);
    const i = await info(scope, dir, name, slug);
    if (i) out.push(i);
  }
  return out;
}

/** Copy a pasted clip into the project's asset library (unique name). */
export async function promoteClip(slug: string, name: string): Promise<AssetInfo | null> {
  const src = join(projectClipsDir(slug), name);
  if (!existsSync(src)) return null;
  const [out] = await saveAssets('project', [{ name, data: await readFile(src) }], slug);
  return out ?? null;
}
