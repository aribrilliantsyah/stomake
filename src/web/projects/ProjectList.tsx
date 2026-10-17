import { Archive, ArchiveRestore, LayoutGrid, List, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectPage, ProjectSort, ProjectSummary } from '../../shared/types';
import { api } from '../api';
import { pickZip, saveZip } from '../desktop';
import { navigate } from '../router';
import { useUi } from '../state/uiStore';
import { ConfirmDialog, PromptDialog } from '../ui/Dialog';
import { Toasts } from '../ui/Toasts';
import { ThemeToggle } from '../ui/ThemeToggle';
import { SettingsButton } from '../ui/SettingsDialog';
import { GridSkeleton } from '../ui/Loading';
import { Logo } from '../ui/Logo';
import { trackLoading } from '../state/progress';
import { fullTime, homeStateFromSearch, homeStateToSearch, PAGE_SIZE, relativeTime, type HomeState, type HomeView } from './homeState';
import { Pager } from './Pager';
import { ProjectMenu, ProjectThumb, type ProjectActions } from './ProjectMenu';

const VIEW_KEY = 'sb.home.view';
const SORT_LABEL: Record<ProjectSort, string> = { updated: 'Terakhir diubah', name: 'Nama A–Z', created: 'Tanggal dibuat', scenes: 'Jumlah scene' };

function storedView(): HomeView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function useHomeState(): [HomeState, (patch: Partial<HomeState>, replace?: boolean) => void] {
  const [s, setS] = useState(() => homeStateFromSearch(location.search, storedView()));
  useEffect(() => {
    const on = () => setS(homeStateFromSearch(location.search, storedView()));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const update = useCallback((patch: Partial<HomeState>, replace = false) => {
    setS((prev) => {
      // any filter change resets to page 1
      const next = { ...prev, ...patch, page: patch.page ?? ('q' in patch || 'status' in patch || 'sort' in patch || 'since' in patch || 'view' in patch ? 1 : prev.page) };
      if (patch.view) {
        try {
          localStorage.setItem(VIEW_KEY, patch.view);
        } catch {
          /* ignore */
        }
      }
      const url = `/${homeStateToSearch(next)}`;
      if (replace) history.replaceState(null, '', url);
      else history.pushState(null, '', url);
      return next;
    });
  }, []);
  return [s, update];
}

type Modal =
  | { kind: 'new' }
  | { kind: 'rename'; p: ProjectSummary }
  | { kind: 'delete'; ps: ProjectSummary[] }
  | null;

export function ProjectList() {
  const [s, update] = useHomeState();
  const [data, setData] = useState<ProjectPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal>(null);
  const [qDraft, setQDraft] = useState(s.q);
  const [reload, setReload] = useState(0);
  const toast = useUi((u) => u.toast);
  const search = useRef<HTMLInputElement>(null);
  const size = PAGE_SIZE[s.view];

  useEffect(() => setQDraft(s.q), [s.q]);
  // debounce search typing into the URL state
  useEffect(() => {
    if (qDraft === s.q) return;
    const t = setTimeout(() => update({ q: qDraft }, true), 250);
    return () => clearTimeout(t);
  }, [qDraft, s.q, update]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    trackLoading(api
      .queryProjects({ q: s.q, status: s.status, sort: s.sort, since: s.since, page: s.page, size })
      .then(
        (r) => {
          if (!alive) return;
          setData(r);
          setError(null);
          // page past the end (e.g. after deleting the last item) → go to the last page
          const last = Math.max(1, Math.ceil(r.total / r.size));
          if (s.page > last) update({ page: last }, true);
        },
        (e) => alive && setError((e as Error).message),
      )
      .finally(() => alive && setLoading(false)));
    return () => {
      alive = false;
    };
  }, [s.q, s.status, s.sort, s.since, s.page, size, reload, update]);

  // keep selection limited to what's visible
  useEffect(() => {
    if (!data) return;
    const vis = new Set(data.items.map((i) => i.slug));
    setSelected((prev) => new Set([...prev].filter((x) => vis.has(x))));
  }, [data]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]') || modal) return;
      if (e.key === '/') {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setModal({ kind: 'new' });
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [modal]);

  const refresh = () => setReload((n) => n + 1);
  const fail = (e: unknown) => toast('err', (e as Error).message);

  const undoDelete = (trashIds: string[]) => async () => {
    try {
      for (const id of trashIds) await api.restoreTrash(id);
      toast('ok', trashIds.length > 1 ? `${trashIds.length} project dipulihkan` : 'Project dipulihkan');
      refresh();
    } catch (e) {
      fail(e);
    }
  };

  async function removeMany(ps: ProjectSummary[]) {
    try {
      const r = await api.bulk('delete', ps.map((p) => p.slug));
      const ids = r.trashIds ?? [];
      toast('ok', ids.length > 1 ? `${ids.length} project dihapus` : `"${ps[0].name}" dihapus`, undefined, ids.length ? { label: 'Urungkan', run: undoDelete(ids) } : undefined);
      if (r.failed.length) toast('err', `Gagal menghapus: ${r.failed.join(', ')}`);
      setSelected(new Set());
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  async function archiveMany(ps: ProjectSummary[], archived: boolean) {
    try {
      const slugs = ps.map((p) => p.slug);
      await api.bulk(archived ? 'archive' : 'unarchive', slugs);
      const label = ps.length > 1 ? `${ps.length} project` : `"${ps[0].name}"`;
      toast('ok', `${label} ${archived ? 'diarsipkan' : 'dipulihkan dari arsip'}`, undefined, {
        label: 'Urungkan',
        run: async () => {
          await api.bulk(archived ? 'unarchive' : 'archive', slugs).catch(fail);
          refresh();
        },
      });
      setSelected(new Set());
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  const actions: ProjectActions = {
    open: (p) => navigate(`/p/${p.slug}`),
    rename: (p) => setModal({ kind: 'rename', p }),
    duplicate: async (p) => {
      try {
        const r = await api.duplicateProject(p.slug);
        toast('ok', `Duplikat dibuat: ${r.slug}`);
        refresh();
      } catch (e) {
        fail(e);
      }
    },
    archive: (p, a) => archiveMany([p], a),
    exportZip: async (p) => {
      try {
        const path = await saveZip(p.slug);
        if (path) toast('ok', `Project diexport: ${path}`);
      } catch (e) {
        fail(e);
      }
    },
    remove: (p) => setModal({ kind: 'delete', ps: [p] }),
  };

  async function importZip() {
    const file = await pickZip();
    if (!file) return;
    try {
      const { slug } = await api.importProjectZip(file);
      toast('ok', `Project diimport: ${slug}`);
      refresh();
    } catch (e) {
      fail(e);
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const selItems = items.filter((i) => selected.has(i.slug));
  const allSel = items.length > 0 && selItems.length === items.length;
  const filtered = s.q !== '' || s.since !== 0 || s.status !== 'active';
  const toggle = (slug: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });

  return (
    <div className="home-scroll">
    <div className="home">
      <header className="home-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Logo />
          <h1>Storyboard Maker</h1>
        </div>
        <div className="home-search">
          <Search size={14} aria-hidden />
          <input
            ref={search}
            type="search"
            data-native-undo
            placeholder="Cari project…  ( / )"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQDraft('');
                update({ q: '' }, true);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>
        <ThemeToggle />
        <SettingsButton />
        <button onClick={importZip} title="Import project dari .zip">
          <Upload size={14} aria-hidden /> Import
        </button>
        <button className="primary" onClick={() => setModal({ kind: 'new' })} title="Project baru (N)">
          <Plus size={14} aria-hidden /> Project Baru
        </button>
      </header>

      <div className="home-filters">
        <div className="seg" role="group" aria-label="Status">
          {(['active', 'archived', 'all'] as const).map((v) => (
            <button key={v} className={s.status === v ? 'on' : ''} onClick={() => update({ status: v })}>
              {v === 'active' ? 'Aktif' : v === 'archived' ? 'Arsip' : 'Semua'}
            </button>
          ))}
        </div>
        <label className="field inline">
          <span>Diubah</span>
          <select value={s.since} onChange={(e) => update({ since: Number(e.target.value) as HomeState['since'] })}>
            <option value={0}>Kapan saja</option>
            <option value={7}>7 hari terakhir</option>
            <option value={30}>30 hari terakhir</option>
          </select>
        </label>
        <label className="field inline">
          <span>Urutkan</span>
          <select value={s.sort} onChange={(e) => update({ sort: e.target.value as ProjectSort })}>
            {(Object.keys(SORT_LABEL) as ProjectSort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <button className="link" onClick={() => update({ q: '', since: 0, status: 'active', sort: s.sort })}>
            Reset filter
          </button>
        )}
        <span className="spacer" />
        <span className="count mono">{loading && !data ? '…' : `${total} project`}</span>
        <div className="seg" role="group" aria-label="Tampilan">
          <button className={s.view === 'grid' ? 'on' : ''} onClick={() => update({ view: 'grid' })} title="Grid">
            <LayoutGrid size={14} aria-hidden /> Grid
          </button>
          <button className={s.view === 'list' ? 'on' : ''} onClick={() => update({ view: 'list' })} title="List">
            <List size={14} aria-hidden /> List
          </button>
        </div>
      </div>

      {selItems.length > 0 && (
        <div className="bulk-bar">
          <span className="mono">{selItems.length} dipilih</span>
          <button onClick={() => setSelected(new Set())}><X size={14} aria-hidden /> Batal pilih</button>
          <span className="spacer" />
          {selItems.some((p) => !p.archived) && <button onClick={() => archiveMany(selItems.filter((p) => !p.archived), true)}><Archive size={14} aria-hidden /> Arsipkan</button>}
          {selItems.some((p) => p.archived) && <button onClick={() => archiveMany(selItems.filter((p) => p.archived), false)}><ArchiveRestore size={14} aria-hidden /> Pulihkan</button>}
          <button className="danger" onClick={() => setModal({ kind: 'delete', ps: selItems })}>
            <Trash2 size={14} aria-hidden /> Hapus ({selItems.length})
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {!data && !error ? (
        <GridSkeleton count={s.view === 'grid' ? 8 : 4} />
      ) : data && items.length === 0 ? (
        <div className="home-empty">
          {filtered ? (
            <>
              <p>Tidak ada project yang cocok{s.q ? ` dengan "${s.q}"` : ''}.</p>
              <button onClick={() => update({ q: '', since: 0, status: 'active' })}>Reset filter</button>
            </>
          ) : (
            <>
              <p>Belum ada project.</p>
              <button className="primary" onClick={() => setModal({ kind: 'new' })}>
                <Plus size={14} aria-hidden /> Project Baru
              </button>
            </>
          )}
        </div>
      ) : s.view === 'grid' ? (
        <div className={`pgrid${loading ? ' dim' : ''}`}>
          {items.map((p) => (
            <article
              key={p.slug}
              className={`pcard${selected.has(p.slug) ? ' sel' : ''}${p.archived ? ' archived' : ''}`}
              onClick={() => !p.broken && actions.open(p)}
            >
              <ProjectThumb p={p} version={reload} />
              <label className="pcheck" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(p.slug)} onChange={() => toggle(p.slug)} aria-label={`Pilih ${p.name}`} />
              </label>
              <div className="pcard-body">
                <div className="pcard-title">
                  <span className="pname" title={p.name}>
                    {p.name}
                  </span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <ProjectMenu p={p} actions={actions} />
                  </span>
                </div>
                <div className="pmeta">
                  <span className="mono">{p.scenes} scene · {p.pages} page</span>
                  {p.agentActive && <span className="badge ai">AI</span>}
                  {p.archived && <span className="badge">ARSIP</span>}
                  {p.broken && <span className="badge err">RUSAK</span>}
                  <span className="spacer" />
                  <span title={fullTime(p.updatedAt)}>{relativeTime(p.updatedAt)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <table className={`list plist${loading ? ' dim' : ''}`}>
          <thead>
            <tr>
              <th className="chk">
                <input
                  type="checkbox"
                  checked={allSel}
                  ref={(el) => {
                    if (el) el.indeterminate = selItems.length > 0 && !allSel;
                  }}
                  onChange={() => setSelected(allSel ? new Set() : new Set(items.map((i) => i.slug)))}
                  aria-label="Pilih semua"
                />
              </th>
              <th />
              <SortTh label="Project" k="name" s={s} update={update} />
              <th>Folder</th>
              <SortTh label="Scene" k="scenes" s={s} update={update} num />
              <th className="num">Page</th>
              <SortTh label="Dibuat" k="created" s={s} update={update} num />
              <SortTh label="Diubah" k="updated" s={s} update={update} num />
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.slug} className={selected.has(p.slug) ? 'sel' : ''} onClick={() => !p.broken && actions.open(p)}>
                <td className="chk" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(p.slug)} onChange={() => toggle(p.slug)} aria-label={`Pilih ${p.name}`} />
                </td>
                <td className="tcell">
                  <ProjectThumb p={p} version={reload} />
                </td>
                <td className="pname">{p.name}</td>
                <td className="mono dim-text">{p.slug}</td>
                <td className="num mono">{p.scenes}</td>
                <td className="num mono">{p.pages}</td>
                <td className="num mono" title={fullTime(p.createdAt)}>
                  {new Date(p.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="num mono" title={fullTime(p.updatedAt)}>
                  {relativeTime(p.updatedAt)}
                </td>
                <td>{p.agentActive && <span className="badge ai">AI</span>} {p.broken ? <span className="badge err">RUSAK</span> : p.archived ? <span className="badge">ARSIP</span> : <span className="dim-text">Aktif</span>}</td>
                <td className="act" onClick={(e) => e.stopPropagation()}>
                  <ProjectMenu p={p} actions={actions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pages > 1 && <Pager page={s.page} pages={pages} total={total} size={size} go={(page) => update({ page })} />}

      {modal?.kind === 'new' && (
        <PromptDialog
          title="Project baru"
          label="Nama project"
          placeholder="mis. Selimut Darurat"
          submitLabel="Buat"
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            const { slug } = await api.createProject(name);
            navigate(`/p/${slug}`);
          }}
        />
      )}
      {modal?.kind === 'rename' && (
        <PromptDialog
          title="Ganti nama project"
          label="Nama"
          initial={modal.p.name}
          submitLabel="Simpan"
          extra={<p className="hint">Folder tetap <span className="mono">{modal.p.slug}</span>.</p>}
          onClose={() => setModal(null)}
          onSubmit={async (name) => {
            await api.renameProject(modal.p.slug, name);
            setModal(null);
            toast('ok', 'Nama project diubah');
            refresh();
          }}
        />
      )}
      {modal?.kind === 'delete' && (
        <ConfirmDialog
          title={modal.ps.length > 1 ? `Hapus ${modal.ps.length} project?` : 'Hapus project?'}
          danger
          confirmLabel="Hapus"
          message={
            <>
              <p>
                {modal.ps.length > 1 ? (
                  <>{modal.ps.length} project</>
                ) : (
                  <>
                    <b>{modal.ps[0].name}</b>
                  </>
                )}{' '}
                akan dipindah ke folder sampah <span className="mono">~/Storyboard/trash</span>.
              </p>
              <p className="hint">Bisa dibatalkan lewat tombol Urungkan di notifikasi.</p>
            </>
          }
          onClose={() => setModal(null)}
          onConfirm={() => removeMany(modal.ps)}
        />
      )}
      <Toasts />
    </div>
    </div>
  );
}

function SortTh({ label, k, s, update, num }: { label: string; k: ProjectSort; s: HomeState; update: (p: Partial<HomeState>) => void; num?: boolean }) {
  return (
    <th className={`sortable${num ? ' num' : ''}${s.sort === k ? ' on' : ''}`} onClick={() => update({ sort: k })} aria-sort={s.sort === k ? 'descending' : 'none'}>
      {label}
      {s.sort === k && <span className="sort-ind">{k === 'name' ? ' ↑' : ' ↓'}</span>}
    </th>
  );
}

