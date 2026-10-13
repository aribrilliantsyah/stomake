/** Upgrades older project.json shapes to the current version. Unknown input is returned unchanged (schema rejects it). */
export function migrateProject(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const p = raw as Record<string, unknown>;
  if (p.version === 1) return { ...p, version: 2, cover: p.cover ?? null };
  return raw;
}
