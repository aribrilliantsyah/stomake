import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { assetRefs, replaceRef } from '../shared/model';
import { parseProject } from '../shared/schema';
import type { AssetRef } from '../shared/types';
import { assetPath, hasAssetExt, isSafeName, projectAssetsDir, projectClipsDir, projectDir, projectsDir, slugify } from './paths';
import { readProject, readStoryline, uniqueSlug } from './store';

/** `uniqueName` naming (`base (n).ext`) against files already in the archive */
function freeName(taken: Zippable, name: string): string {
  if (!(name in taken)) return name;
  const ext = extname(name);
  const base = name.slice(0, name.length - ext.length).trimEnd();
  for (let n = 2; ; n++) if (!(`${base} (${n})${ext}` in taken)) return `${base} (${n})${ext}`;
}

/** marks a storyboard project archive; bumped if the layout inside the zip changes */
const FORMAT = 'stomake/project@1';
const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;

export class ZipError extends Error {}

async function folderFiles(dir: string): Promise<[string, Uint8Array][]> {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile() && isSafeName(d.name)).map((d) => d.name);
  return Promise.all(names.map(async (n) => [n, new Uint8Array(await readFile(join(dir, n)))] as [string, Uint8Array]));
}

/**
 * One portable archive per project: project.json, storyline.txt, assets/, clips/.
 * Global library assets the project uses are copied into assets/ and their refs rewritten,
 * so the archive opens complete on another computer.
 */
export async function exportProjectZip(slug: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; fileName: string }> {
  let project = await readProject(slug);
  const assets: Zippable = Object.fromEntries(await folderFiles(projectAssetsDir(slug)));
  for (const ref of assetRefs(project)) {
    if (!ref.startsWith('global:')) continue;
    const src = assetPath(ref, slug);
    if (!existsSync(src)) continue; // missing stays missing; the editor shows it as such
    const name = freeName(assets, ref.slice('global:'.length));
    assets[name] = new Uint8Array(await readFile(src));
    project = replaceRef(project, ref, `project:${name}` as AssetRef);
  }
  // images are already compressed: store them as-is (level 0), deflate the text files
  const text = (s: string): [Uint8Array, { level: 6 }] => [strToU8(s), { level: 6 }];
  const files: Zippable = {
    'storyboard.json': text(JSON.stringify({ format: FORMAT, slug, exportedAt: new Date().toISOString() })),
    'project.json': text(JSON.stringify(project, null, 2)),
    'storyline.txt': text(await readStoryline(slug)),
    assets,
    clips: Object.fromEntries(await folderFiles(projectClipsDir(slug))),
  };
  return { bytes: zipSync(files, { level: 0 }), fileName: `${slug}.storyboard.zip` };
}

/** Unpacks an exported archive into a new project folder. Returns the new slug. */
export async function importProjectZip(bytes: Uint8Array): Promise<string> {
  let entries: Record<string, Uint8Array>;
  let total = 0;
  try {
    entries = unzipSync(bytes, {
      // declared sizes are checked before inflating: a tiny zip can't expand into gigabytes
      filter: (f) => {
        if (f.name.endsWith('/')) return false;
        total += f.originalSize;
        if (total > MAX_UNPACKED_BYTES) throw new ZipError('Isi zip terlalu besar (maks 1 GB)');
        return true;
      },
    });
  } catch (e) {
    throw e instanceof ZipError ? e : new ZipError('Bukan file .zip yang valid');
  }
  // accept archives re-zipped by hand with an extra top folder: <dir>/project.json
  const jsonPath = Object.keys(entries).find((k) => k === 'project.json' || /^[^/]+\/project\.json$/.test(k));
  if (!jsonPath) throw new ZipError('project.json tidak ada di dalam zip');
  const prefix = jsonPath.slice(0, -'project.json'.length);
  let project;
  try {
    project = parseProject(JSON.parse(strFromU8(entries[jsonPath])));
  } catch {
    throw new ZipError('project.json di dalam zip rusak atau bukan project Stomake');
  }

  const inFolder = (folder: string) =>
    Object.entries(entries).flatMap(([k, v]) => {
      if (!k.startsWith(prefix + folder)) return [];
      const name = k.slice((prefix + folder).length);
      // flat folders only; anything else (traversal, nested, dotfiles, non-images) is ignored
      return name && isSafeName(name) && hasAssetExt(name) ? [[name, v] as const] : [];
    });

  const slug = uniqueSlug(slugify(project.name) || 'project');
  const dir = projectDir(slug);
  await mkdir(projectsDir(), { recursive: true });
  try {
    await mkdir(projectAssetsDir(slug), { recursive: true });
    await mkdir(join(dir, 'exports'), { recursive: true });
    for (const [name, data] of inFolder('assets/')) await writeFile(join(projectAssetsDir(slug), name), data);
    const clips = inFolder('clips/');
    if (clips.length) await mkdir(projectClipsDir(slug), { recursive: true });
    for (const [name, data] of clips) await writeFile(join(projectClipsDir(slug), name), data);
    const story = entries[prefix + 'storyline.txt'];
    await writeFile(join(dir, 'storyline.txt'), story ? strFromU8(story) : '', 'utf8');
    const now = new Date().toISOString();
    await writeFile(join(dir, 'project.json'), JSON.stringify({ ...project, archived: false, updatedAt: now }, null, 2), 'utf8');
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
  return slug;
}
