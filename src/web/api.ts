import type { AssetInfo, Project, ProjectPage, ProjectQuery, SettingsView } from '../shared/types';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw Object.assign(new Error((body as { error?: string }).error ?? `HTTP ${r.status}`), { status: r.status });
  }
  return r.json() as Promise<T>;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export interface AssetLists {
  project: AssetInfo[];
  global: AssetInfo[];
}

export const api = {
  getSettings: () => req<SettingsView>('/api/settings'),
  putSettings: (s: { mcp: { enabled: boolean } }) => req<SettingsView>('/api/settings', jsonInit('PUT', s)),
  queryProjects: (q: ProjectQuery) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '' && v !== 0) p.set(k, String(v));
    return req<ProjectPage>(`/api/projects?${p}`);
  },
  renameProject: (slug: string, name: string) => req<{ slug: string; name: string }>(`/api/projects/${slug}/rename`, jsonInit('POST', { name })),
  duplicateProject: (slug: string) => req<{ slug: string }>(`/api/projects/${slug}/duplicate`, { method: 'POST' }),
  archiveProject: (slug: string, archived: boolean) => req<{ ok: true }>(`/api/projects/${slug}/archive`, jsonInit('POST', { archived })),
  deleteProject: (slug: string) => req<{ trashId: string }>(`/api/projects/${slug}`, { method: 'DELETE' }),
  restoreTrash: (id: string) => req<{ slug: string }>(`/api/trash/${id}/restore`, { method: 'POST' }),
  bulk: (action: 'archive' | 'unarchive' | 'delete', slugs: string[]) =>
    req<{ ok: string[]; failed: string[]; trashIds?: string[] }>('/api/projects/bulk', jsonInit('POST', { action, slugs })),
  createProject: (name: string) => req<{ slug: string }>('/api/projects', jsonInit('POST', { name })),
  getProject: (slug: string) => req<Project>(`/api/projects/${slug}`),
  saveProject: (slug: string, p: Project) => req<{ updatedAt: string }>(`/api/projects/${slug}`, jsonInit('PUT', p)),
  agentAck: (slug: string, clientId: string) => req<{ ok: true }>(`/api/projects/${slug}/agent-ack`, jsonInit('POST', { clientId })),
  getStoryline: (slug: string) => req<{ text: string }>(`/api/projects/${slug}/storyline`),
  saveStoryline: (slug: string, text: string) => req<{ ok: true }>(`/api/projects/${slug}/storyline`, jsonInit('PUT', { text })),
  importDocx: (slug: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<{ text: string }>(`/api/projects/${slug}/storyline/import`, { method: 'POST', body: fd });
  },
  deleteAsset: (ref: string, slug: string) => {
    const [scope, name] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
    const url = scope === 'global' ? `/api/assets/global/${encodeURIComponent(name)}` : `/api/assets/project/${slug}/${encodeURIComponent(name)}`;
    return req<{ trashId: string }>(url, { method: 'DELETE' });
  },
  restoreAsset: (trashId: string) => req<AssetInfo>(`/api/assets/trash/${trashId}/restore`, { method: 'POST' }),
  assetUsage: (ref: string, slug: string) => req<{ slug: string; name: string; count: number }[]>(`/api/assets/usage?project=${slug}&ref=${encodeURIComponent(ref)}`),
  listAssets: (slug: string) => req<AssetLists>(`/api/assets?project=${slug}`),
  uploadAssets: (scope: 'global' | 'project', files: File[], slug: string) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const url = scope === 'global' ? '/api/assets/global' : `/api/assets/project/${slug}`;
    return req<AssetInfo[]>(url, { method: 'POST', body: fd });
  },
  /** pasted images: kept with the project (ref clip:...) but not added to the asset library */
  uploadClips: (slug: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    return req<AssetInfo[]>(`/api/projects/${slug}/clips`, { method: 'POST', body: fd });
  },
  promoteClip: (slug: string, name: string) => req<AssetInfo>(`/api/projects/${slug}/clips/${encodeURIComponent(name)}/promote`, { method: 'POST' }),
  exportPdf: (slug: string) =>
    req<{ path: string; missingAssets: string[]; fonts?: string[]; missingFonts?: string[] }>(`/api/projects/${slug}/export`, { method: 'POST' }),
};
