import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { McpLogEntry, McpLogPage } from '../../shared/types';
import { dataRoot } from '../paths';

/** long strings in payloads (SVG source, storyline) are cut to this many characters */
export const MAX_PAYLOAD_STRING = 2000;

const logFile = () => join(dataRoot(), 'logs', 'mcp.jsonl');

let config = { enabled: true, payloads: true, maxEntries: 2000 };
/** newest last; loaded from disk once per data folder */
let entries: McpLogEntry[] = [];
let loadedFor: string | null = null;
let nextId = 1;
/** lines in the file; it's rewritten down to the in-memory window when it reaches 2× maxEntries */
let fileLines = 0;
const subscribers = new Set<(e: McpLogEntry) => void>();

export function configureMcpLog(c: { enabled: boolean; payloads: boolean; maxEntries: number }): void {
  config = { ...c };
  ensureLoaded();
  if (entries.length > config.maxEntries) entries = entries.slice(-config.maxEntries);
}

function ensureLoaded(): void {
  const file = logFile();
  if (loadedFor === file) return;
  loadedFor = file;
  entries = [];
  fileLines = 0;
  if (existsSync(file)) {
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    fileLines = lines.length;
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as McpLogEntry);
      } catch {
        /* a torn last line from a crash */
      }
    }
    entries = entries.slice(-config.maxEntries);
  }
  nextId = (entries.at(-1)?.id ?? 0) + 1;
}

function trimStrings(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.length > MAX_PAYLOAD_STRING ? `${v.slice(0, MAX_PAYLOAD_STRING)}… (+${v.length - MAX_PAYLOAD_STRING} karakter)` : v;
  if (depth > 8 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => trimStrings(x, depth + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trimStrings(x, depth + 1)]));
}

export function recordMcp(e: Omit<McpLogEntry, 'id' | 'at'>): void {
  if (!config.enabled) return;
  ensureLoaded();
  const { input, output, ...rest } = e;
  const entry: McpLogEntry = { id: nextId++, at: new Date().toISOString(), ...rest };
  if (config.payloads) {
    if (input !== undefined) entry.input = trimStrings(input);
    if (output !== undefined) entry.output = trimStrings(output);
  }
  entries.push(entry);
  if (entries.length > config.maxEntries) entries.shift();
  try {
    const file = logFile();
    mkdirSync(dirname(file), { recursive: true });
    if (fileLines + 1 > config.maxEntries * 2) {
      writeFileSync(file, `${entries.map((x) => JSON.stringify(x)).join('\n')}\n`);
      fileLines = entries.length;
    } else {
      appendFileSync(file, `${JSON.stringify(entry)}\n`);
      fileLines++;
    }
  } catch (err) {
    console.warn(`mcp log: ${(err as Error).message}`);
  }
  for (const fn of subscribers) fn(entry);
}

export function subscribeMcpLog(fn: (e: McpLogEntry) => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export interface McpLogQuery {
  q?: string;
  tool?: string;
  status?: 'ok' | 'error';
  kind?: McpLogEntry['kind'];
  slug?: string;
  /** ISO lower bound (inclusive) */
  since?: string;
  /** ISO upper bound (exclusive) */
  before?: string;
  limit?: number;
}

export function matchesMcpLog(e: McpLogEntry, f: McpLogQuery): boolean {
  if (f.tool && e.tool !== f.tool) return false;
  if (f.status && e.status !== f.status) return false;
  if (f.kind && e.kind !== f.kind) return false;
  if (f.slug && e.slug !== f.slug) return false;
  if (f.since && e.at < f.since) return false;
  if (f.before && e.at >= f.before) return false;
  if (f.q) {
    const needle = f.q.toLowerCase();
    const hay = [e.tool, e.slug, e.error, e.client, e.input === undefined ? '' : JSON.stringify(e.input), e.output === undefined ? '' : JSON.stringify(e.output)]
      .join('\n')
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

/** Newest first. */
export function queryMcpLog(f: McpLogQuery): McpLogPage {
  ensureLoaded();
  const all = entries.filter((e) => matchesMcpLog(e, f)).reverse();
  const limit = Math.max(1, Math.min(1000, f.limit ?? 200));
  const tools = [...new Set(entries.map((e) => e.tool).filter((t): t is string => !!t))].sort();
  const slugs = [...new Set(entries.map((e) => e.slug).filter((s): s is string => !!s))].sort();
  return { items: all.slice(0, limit), total: all.length, tools, slugs };
}

/** Matching entries oldest first, one JSON object per line. */
export function exportMcpLog(f: McpLogQuery): string {
  ensureLoaded();
  return entries
    .filter((e) => matchesMcpLog(e, f))
    .map((e) => JSON.stringify(e))
    .join('\n');
}

export function clearMcpLog(): void {
  ensureLoaded();
  entries = [];
  fileLines = 0;
  try {
    writeFileSync(logFile(), '');
  } catch {
    /* no log folder yet */
  }
}
