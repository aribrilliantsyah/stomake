import type { AssetInfo, Project, ProjectSummary } from '../shared/types';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
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
  listProjects: () => req<ProjectSummary[]>('/api/projects'),
  createProject: (name: string) => req<{ slug: string }>('/api/projects', jsonInit('POST', { name })),
  getProject: (slug: string) => req<Project>(`/api/projects/${slug}`),
  saveProject: (slug: string, p: Project) => req<{ updatedAt: string }>(`/api/projects/${slug}`, jsonInit('PUT', p)),
  getStoryline: (slug: string) => req<{ text: string }>(`/api/projects/${slug}/storyline`),
  saveStoryline: (slug: string, text: string) => req<{ ok: true }>(`/api/projects/${slug}/storyline`, jsonInit('PUT', { text })),
  importDocx: (slug: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<{ text: string }>(`/api/projects/${slug}/storyline/import`, { method: 'POST', body: fd });
  },
  listAssets: (slug: string) => req<AssetLists>(`/api/assets?project=${slug}`),
  uploadAssets: (scope: 'global' | 'project', files: File[], slug: string) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const url = scope === 'global' ? '/api/assets/global' : `/api/assets/project/${slug}`;
    return req<AssetInfo[]>(url, { method: 'POST', body: fd });
  },
  exportPdf: (slug: string) =>
    req<{ path: string; missingAssets: string[]; fonts?: string[]; missingFonts?: string[] }>(`/api/projects/${slug}/export`, { method: 'POST' }),
};
