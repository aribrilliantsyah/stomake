import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { AssetRef } from '../shared/types';

export const ASSET_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'] as const;

export function defaultDataRoot(): string {
  return join(homedir(), 'Storyboard');
}

function osConfigDir(name: string): string {
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), name);
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', name);
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), name);
}

/**
 * Per-OS app config folder. Holds only the pointer to the data folder: settings.json lives inside
 * the data folder, so it can't say where that folder is.
 */
export function configDir(): string {
  return process.env.STORYBOARD_CONFIG_DIR ?? osConfigDir('stomake');
}

const locationFile = () => join(configDir(), 'location.json');

function readPointer(file: string): string | null {
  try {
    const v = JSON.parse(readFileSync(file, 'utf8')) as { dataRoot?: unknown };
    return typeof v.dataRoot === 'string' && isAbsolute(v.dataRoot) ? v.dataRoot : null;
  } catch {
    return null; // missing or corrupt → next candidate
  }
}

/** chosen folder, cached per pointer file (tests swap STORYBOARD_CONFIG_DIR) */
let chosen: { file: string; root: string | null } | null = null;

function chosenRoot(): string | null {
  const file = locationFile();
  if (chosen?.file === file) return chosen.root;
  // falls back to the pointer written before the app was renamed to Stomake
  const root = readPointer(file) ?? (process.env.STORYBOARD_CONFIG_DIR ? null : readPointer(join(osConfigDir('storyboard-maker'), 'location.json')));
  chosen = { file, root };
  return root;
}

/** STORYBOARD_HOME (fixed by the environment) > folder chosen in Pengaturan > ~/Storyboard */
export function dataRoot(): string {
  return process.env.STORYBOARD_HOME ?? chosenRoot() ?? defaultDataRoot();
}

/** Switch the data folder (created when missing). Existing data is not moved. */
export function setDataRoot(dir: string): string {
  if (!isAbsolute(dir)) throw new Error('Folder harus path lengkap (absolut)');
  const root = resolve(dir);
  mkdirSync(root, { recursive: true });
  const file = locationFile();
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify({ dataRoot: root }, null, 2), 'utf8');
  renameSync(`${file}.tmp`, file);
  chosen = { file, root };
  return root;
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
