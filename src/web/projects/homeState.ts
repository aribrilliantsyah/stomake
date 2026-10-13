import type { ProjectSort, ProjectStatus } from '../../shared/types';

export type HomeView = 'grid' | 'list';

export interface HomeState {
  q: string;
  status: ProjectStatus;
  sort: ProjectSort;
  /** 0 = any time; 7 / 30 = updated within N days */
  since: 0 | 7 | 30;
  page: number;
  view: HomeView;
}

export const DEFAULT_HOME: HomeState = { q: '', status: 'active', sort: 'updated', since: 0, page: 1, view: 'grid' };
export const PAGE_SIZE: Record<HomeView, number> = { grid: 24, list: 50 };

const STATUSES: ProjectStatus[] = ['active', 'archived', 'all'];
const SORTS: ProjectSort[] = ['updated', 'name', 'created', 'scenes'];

export function homeStateFromSearch(search: string, fallbackView: HomeView = 'grid'): HomeState {
  const p = new URLSearchParams(search);
  const since = Number(p.get('since'));
  const page = Math.floor(Number(p.get('page')));
  const view = p.get('view');
  return {
    q: p.get('q') ?? '',
    status: STATUSES.includes(p.get('status') as ProjectStatus) ? (p.get('status') as ProjectStatus) : 'active',
    sort: SORTS.includes(p.get('sort') as ProjectSort) ? (p.get('sort') as ProjectSort) : 'updated',
    since: since === 7 || since === 30 ? since : 0,
    page: page >= 1 ? page : 1,
    view: view === 'grid' || view === 'list' ? view : fallbackView,
  };
}

/** Only non-default values go into the URL. */
export function homeStateToSearch(s: HomeState): string {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.status !== DEFAULT_HOME.status) p.set('status', s.status);
  if (s.sort !== DEFAULT_HOME.sort) p.set('sort', s.sort);
  if (s.since) p.set('since', String(s.since));
  if (s.page > 1) p.set('page', String(s.page));
  if (s.view !== DEFAULT_HOME.view) p.set('view', s.view);
  const out = p.toString();
  return out ? `?${out}` : '';
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '-';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'kemarin';
  if (d < 7) return `${d} hari lalu`;
  return new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fullTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
}
