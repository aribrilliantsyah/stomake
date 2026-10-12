import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createProject } from '../shared/model';
import { parseProject } from '../shared/schema';
import type { Project, ProjectSummary } from '../shared/types';
import { projectAssetsDir, projectDir, projectsDir, slugify } from './paths';

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

export async function listProjects(): Promise<ProjectSummary[]> {
  if (!existsSync(projectsDir())) return [];
  const out: ProjectSummary[] = [];
  for (const slug of await readdir(projectsDir())) {
    try {
      const p = JSON.parse(await readFile(projectFile(slug), 'utf8')) as Project;
      out.push({ slug, name: p.name, updatedAt: p.updatedAt });
    } catch {
      /* not a project folder */
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createProjectOnDisk(name: string): Promise<string> {
  const base = slugify(name) || 'project';
  let slug = base;
  for (let n = 2; existsSync(projectDir(slug)); n++) slug = `${base}-${n}`;
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

/** Validates, stamps updatedAt (strictly increasing), writes atomically. */
export async function saveProject(slug: string, body: unknown): Promise<string> {
  const project = parseProject(body);
  let now = new Date().toISOString();
  if (now <= project.updatedAt) now = new Date(Date.parse(project.updatedAt) + 1).toISOString();
  project.updatedAt = now;
  await writeAtomic(projectFile(slug), JSON.stringify(project, null, 2));
  return now;
}

export async function readStoryline(slug: string): Promise<string> {
  try {
    return await readFile(storylineFile(slug), 'utf8');
  } catch {
    return '';
  }
}

export async function writeStoryline(slug: string, text: string): Promise<void> {
  await writeAtomic(storylineFile(slug), text);
}
