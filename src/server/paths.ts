import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AssetRef } from '../shared/types';

export const ASSET_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'] as const;

export function dataRoot(): string {
  return process.env.STORYBOARD_HOME ?? join(homedir(), 'Storyboard');
}

export function settingsFile(): string {
  return join(dataRoot(), 'settings.json');
}

export function projectsDir(): string {
  return join(dataRoot(), 'projects');
}

export function trashDir(): string {
  return join(dataRoot(), 'trash');
}

/** trash entry names: `<slug>__<timestamp>` */
export function isValidTrashId(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*__\d{13,}$/.test(id);
}

export function libraryDir(): string {
  return join(dataRoot(), 'library');
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/** File name usable inside an asset folder: no separators, no traversal, no dotfiles. */
export function isSafeName(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name.startsWith('.')) return false;
  if (/[/\\\0]/.test(name)) return false;
  if (name.includes('..')) return false;
  return true;
}

export function hasAssetExt(name: string): boolean {
  const lower = name.toLowerCase();
  return ASSET_EXTS.some((e) => lower.endsWith(e));
}

export function projectDir(slug: string): string {
  return join(projectsDir(), slug);
}

export function projectClipsDir(slug: string): string {
  return join(projectDir(slug), 'clips');
}

export function projectAssetsDir(slug: string): string {
  return join(projectDir(slug), 'assets');
}

export function assetPath(ref: AssetRef, slug: string): string {
  const i = ref.indexOf(':');
  const scope = ref.slice(0, i);
  const name = ref.slice(i + 1);
  if (!isSafeName(name)) throw new Error(`unsafe asset name: ${name}`);
  return scope === 'global' ? join(libraryDir(), name) : join(projectAssetsDir(slug), name);
}
