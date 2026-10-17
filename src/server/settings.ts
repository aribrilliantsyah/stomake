import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { McpSettings, Settings } from '../shared/types';
import { settingsFile } from './paths';

export const DEFAULT_MCP_PORT = 5179;

const host = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/, 'nama host tidak valid');

const mcpSchema = z
  .object({
    enabled: z.boolean(),
    port: z.number().int().min(1024).max(65535),
    allowedHosts: z.array(host).max(20),
    tools: z.record(z.string(), z.boolean()),
    lock: z.object({ idleSeconds: z.number().int().min(3).max(300), ackSeconds: z.number().int().min(1).max(30) }).strict(),
    log: z.object({ enabled: z.boolean(), payloads: z.boolean(), maxEntries: z.number().int().min(100).max(20000) }).strict(),
  })
  .strict();

const settingsSchema = z.object({ mcp: mcpSchema }).strict();

/** what a PUT may send: any subset, nested objects partial too */
export const settingsPatchSchema = z
  .object({
    mcp: z
      .object({
        enabled: z.boolean(),
        port: z.number(),
        allowedHosts: z.array(z.string()),
        tools: z.record(z.string(), z.boolean()),
        lock: z.object({ idleSeconds: z.number(), ackSeconds: z.number() }).partial().strict(),
        log: z.object({ enabled: z.boolean(), payloads: z.boolean(), maxEntries: z.number() }).partial().strict(),
      })
      .partial()
      .strict(),
  })
  .strict()
  .refine((p) => p.mcp !== undefined && Object.keys(p.mcp).length > 0, 'kosong');
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export function defaultSettings(): Settings {
  return {
    mcp: {
      enabled: false,
      port: DEFAULT_MCP_PORT,
      allowedHosts: [],
      tools: {},
      lock: { idleSeconds: 10, ackSeconds: 3 },
      log: { enabled: true, payloads: true, maxEntries: 2000 },
    },
  };
}

/** Patch over current (nested objects merge one level deep). Throws ZodError when the result is invalid. */
export function mergeSettings(cur: Settings, patch: SettingsPatch): Settings {
  const m = patch.mcp ?? {};
  const next: McpSettings = {
    ...cur.mcp,
    ...m,
    lock: { ...cur.mcp.lock, ...m.lock },
    log: { ...cur.mcp.log, ...m.log },
    tools: { ...cur.mcp.tools, ...m.tools },
  };
  return settingsSchema.parse({ mcp: next });
}

/** Cached per settings file path (the data root can change between tests). */
let cache: { file: string; value: Settings } | null = null;

export async function readSettings(): Promise<Settings> {
  const file = settingsFile();
  if (cache?.file === file) return cache.value;
  let value = defaultSettings();
  try {
    const raw: unknown = JSON.parse(await readFile(file, 'utf8'));
    // older files only had { mcp: { enabled } }: fill the rest from defaults
    value = mergeSettings(value, settingsPatchSchema.parse(raw));
  } catch {
    /* missing, corrupt or invalid → defaults */
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

let lastCall: string | null = null;

export function noteMcpCall(): void {
  lastCall = new Date().toISOString();
}

export function lastMcpCallAt(): string | null {
  return lastCall;
}
