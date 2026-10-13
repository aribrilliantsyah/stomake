import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Settings } from '../shared/types';
import { settingsFile } from './paths';

export const settingsSchema = z.object({ mcp: z.object({ enabled: z.boolean() }).strict() }).strict();

const DEFAULTS: Settings = { mcp: { enabled: false } };

/** Cached per settings file path (the data root can change between tests). */
let cache: { file: string; value: Settings } | null = null;

export async function readSettings(): Promise<Settings> {
  const file = settingsFile();
  if (cache?.file === file) return cache.value;
  let value: Settings = structuredClone(DEFAULTS);
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
    if (parsed.success) value = parsed.data;
  } catch {
    /* missing or corrupt → defaults */
  }
  cache = { file, value };
  return value;
}

export async function writeSettings(s: Settings): Promise<void> {
  const file = settingsFile();
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
  await rename(tmp, file);
  cache = { file, value: s };
}

export async function isMcpEnabled(): Promise<boolean> {
  return (await readSettings()).mcp.enabled;
}

let lastCall: string | null = null;

export function noteMcpCall(): void {
  lastCall = new Date().toISOString();
}

export function lastMcpCallAt(): string | null {
  return lastCall;
}
