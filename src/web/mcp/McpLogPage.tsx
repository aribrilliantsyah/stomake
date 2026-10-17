import { ArrowLeft, Download, Pause, Play, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { McpLogEntry, McpLogPage as Page } from '../../shared/types';
import { api } from '../api';
import { fullTime, relativeTime } from '../projects/homeState';
import { navigate } from '../router';
import { useUi } from '../state/uiStore';
import { ConfirmDialog } from '../ui/Dialog';
import { Logo } from '../ui/Logo';
import { CopyButton } from '../ui/McpSettings';
import { SettingsButton } from '../ui/SettingsDialog';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Toasts } from '../ui/Toasts';

type Filters = { q: string; tool: string; status: '' | 'ok' | 'error'; kind: '' | McpLogEntry['kind']; slug: string; range: '' | '15m' | '1h' | '24h' | '7d' };

const KIND_LABEL: Record<McpLogEntry['kind'], string> = { call: 'Panggil tool', list: 'Daftar tool', init: 'Terhubung', rejected: 'Ditolak', other: 'Lainnya' };
const RANGE_MS: Record<Exclude<Filters['range'], ''>, number> = { '15m': 15 * 60e3, '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3 };
const EMPTY: Filters = { q: '', tool: '', status: '', kind: '', slug: '', range: '' };

function filtersFromUrl(): Filters {
  const p = new URLSearchParams(location.search);
  const pick = <T extends string>(k: string, ok: readonly T[]): T | '' => (ok.includes(p.get(k) as T) ? (p.get(k) as T) : '');
  return {
    q: p.get('q') ?? '',
    tool: p.get('tool') ?? '',
    slug: p.get('slug') ?? '',
    status: pick('status', ['ok', 'error'] as const),
    kind: pick('kind', ['call', 'list', 'init', 'rejected', 'other'] as const),
    range: pick('range', ['15m', '1h', '24h', '7d'] as const),
  };
}

function toQuery(f: Filters): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.q.trim()) q.q = f.q.trim();
  if (f.tool) q.tool = f.tool;
  if (f.status) q.status = f.status;
  if (f.kind) q.kind = f.kind;
  if (f.slug) q.slug = f.slug;
  if (f.range) q.since = new Date(Date.now() - RANGE_MS[f.range]).toISOString();
  return q;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const pretty = (v: unknown) => JSON.stringify(v, null, 2);

export function McpLogPage() {
  const toast = useUi((u) => u.toast);
  const [f, setF] = useState<Filters>(filtersFromUrl);
  const [qDraft, setQDraft] = useState(f.q);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [sel, setSel] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const fRef = useRef(f);
  fRef.current = f;

  const load = useCallback(async () => {
    try {
      setPage(await api.mcpLogs({ ...toQuery(fRef.current), limit: '500' }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // filters → URL (shareable, Back works) and reload
  useEffect(() => {
    const q = new URLSearchParams(Object.entries({ q: f.q, tool: f.tool, status: f.status, kind: f.kind, slug: f.slug, range: f.range }).filter(([, v]) => v));
    const url = `/mcp-logs${q.size ? `?${q}` : ''}`;
    if (url !== location.pathname + location.search) history.replaceState(null, '', url);
    void load();
  }, [f, load]);

  useEffect(() => {
    const t = setTimeout(() => setF((x) => (x.q === qDraft ? x : { ...x, q: qDraft })), 250);
    return () => clearTimeout(t);
  }, [qDraft]);

  useEffect(() => {
    api.getSettings().then((s) => setEnabled(s.mcp.enabled), () => setEnabled(null));
  }, []);

  // live: new entries stream in; refetch with the current filters (server does the matching)
  useEffect(() => {
    if (!live) return;
    const es = new EventSource('/api/mcp/logs/events');
    let t: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        void load();
      }, 200);
    };
    return () => {
      es.close();
      clearTimeout(t ?? undefined);
    };
  }, [live, load]);

  const items = page?.items ?? [];
  const selected = useMemo(() => items.find((e) => e.id === sel) ?? null, [items, sel]);
  const filtered = JSON.stringify(f) !== JSON.stringify(EMPTY);
  const errors = items.filter((e) => e.status === 'error').length;

  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));
  const exportHref = `/api/mcp/logs/export?${new URLSearchParams(toQuery(f))}`;

  // keyboard: ↑/↓ move the selection, Esc closes the detail
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'Escape') setSel(null);
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const i = items.findIndex((x) => x.id === sel);
      const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) setSel(next.id);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [items, sel]);

  return (
    <div className="logs">
      <header className="logs-head">
        <button className="ghost" onClick={() => navigate('/')} title="Kembali ke Home">
          <ArrowLeft size={14} aria-hidden /> Projects
        </button>
        <Logo size={18} />
        <h1>Log MCP</h1>
        <span className="muted logs-sub">{enabled === false ? 'MCP sedang mati' : 'Panggilan agent ke Storyboard Maker'}</span>
        <span className="grow" />
        <button className={live ? 'on' : ''} onClick={() => setLive(!live)} aria-pressed={live} title={live ? 'Hentikan pembaruan langsung' : 'Perbarui langsung'}>
          {live ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />} Live
        </button>
        <button className="ib" onClick={() => void load()} title="Muat ulang" aria-label="Muat ulang">
          <RefreshCw size={14} aria-hidden />
        </button>
        <a className="btn" href={exportHref} download>
          <Download size={14} aria-hidden /> Export
        </a>
        <button className="danger" onClick={() => setConfirmClear(true)} disabled={!page?.total && !filtered}>
          <Trash2 size={14} aria-hidden /> Hapus log
        </button>
        <ThemeToggle />
        <SettingsButton />
      </header>

      <div className="logs-filters">
        <div className="home-search logs-search">
          <Search size={14} aria-hidden />
          <input type="search" data-native-undo placeholder="Cari tool, project, error, isi…" value={qDraft} onChange={(e) => setQDraft(e.target.value)} aria-label="Cari log" />
        </div>
        <div className="seg" role="group" aria-label="Status">
          {(
            [
              ['', 'Semua'],
              ['ok', 'Berhasil'],
              ['error', 'Gagal'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={f.status === v ? 'on' : ''} onClick={() => set({ status: v })}>
              {label}
            </button>
          ))}
        </div>
        <label className="field inline">
          <span>Tool</span>
          <select value={f.tool} onChange={(e) => set({ tool: e.target.value })}>
            <option value="">Semua tool</option>
            {(page?.tools ?? []).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span>Jenis</span>
          <select value={f.kind} onChange={(e) => set({ kind: e.target.value as Filters['kind'] })}>
            <option value="">Semua</option>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span>Project</span>
          <select value={f.slug} onChange={(e) => set({ slug: e.target.value })}>
            <option value="">Semua project</option>
            {(page?.slugs ?? []).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span>Waktu</span>
          <select value={f.range} onChange={(e) => set({ range: e.target.value as Filters['range'] })}>
            <option value="">Kapan saja</option>
            <option value="15m">15 menit terakhir</option>
            <option value="1h">1 jam terakhir</option>
            <option value="24h">24 jam terakhir</option>
            <option value="7d">7 hari terakhir</option>
          </select>
        </label>
        {filtered && (
          <button
            className="link"
            onClick={() => {
              setQDraft('');
              setF(EMPTY);
            }}
          >
            <X size={13} aria-hidden /> Reset filter
          </button>
        )}
        <span className="grow" />
        <span className="count mono">
          {page ? `${page.total} entri${errors ? ` · ${errors} gagal` : ''}${page.total > items.length ? ` · ${items.length} terbaru ditampilkan` : ''}` : '…'}
        </span>
      </div>

      {error && <p className="error">Gagal memuat log: {error}</p>}

      <div className={`logs-body${selected ? ' with-detail' : ''}`}>
        <div className="logs-table-wrap">
          {page && items.length === 0 ? (
            <div className="home-empty">
              {filtered ? (
                <>
                  <p>Tidak ada entri yang cocok dengan filter.</p>
                  <button
                    onClick={() => {
                      setQDraft('');
                      setF(EMPTY);
                    }}
                  >
                    Reset filter
                  </button>
                </>
              ) : (
                <p>{enabled === false ? 'Belum ada log. Nyalakan MCP di Pengaturan, lalu hubungkan agent.' : 'Belum ada panggilan. Entri muncul di sini begitu agent memakai MCP.'}</p>
              )}
            </div>
          ) : (
            <table className="list logs-table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Jenis</th>
                  <th>Tool</th>
                  <th>Project</th>
                  <th className="num">Durasi</th>
                  <th>Client</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className={`${e.status === 'error' ? 'err' : ''}${e.id === sel ? ' sel' : ''}`} onClick={() => setSel(e.id === sel ? null : e.id)} aria-selected={e.id === sel}>
                    <td className="mono" title={fullTime(e.at)}>
                      <span className={`dot ${e.status}`} aria-label={e.status === 'ok' ? 'berhasil' : 'gagal'} />
                      {clock(e.at)}
                    </td>
                    <td>{KIND_LABEL[e.kind]}</td>
                    <td className="mono">{e.tool ?? <span className="muted">-</span>}</td>
                    <td className="mono ellipsis">{e.slug ?? <span className="muted">-</span>}</td>
                    <td className="num mono">{e.ms} ms</td>
                    <td className="ellipsis muted">{e.client ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <aside className="logs-detail" aria-label="Detail entri">
            <div className="logs-detail-head">
              <span className={`dot ${selected.status}`} />
              <b className="mono">{selected.tool ?? KIND_LABEL[selected.kind]}</b>
              <span className="grow" />
              <button className="ib ghost" onClick={() => setSel(null)} aria-label="Tutup detail" title="Tutup (Esc)">
                <X size={14} aria-hidden />
              </button>
            </div>
            <dl className="logs-meta">
              <dt>Waktu</dt>
              <dd>
                {fullTime(selected.at)} <span className="muted">({relativeTime(selected.at)})</span>
              </dd>
              <dt>Jenis</dt>
              <dd>{KIND_LABEL[selected.kind]}</dd>
              <dt>Status</dt>
              <dd>{selected.status === 'ok' ? 'Berhasil' : 'Gagal'}</dd>
              <dt>Durasi</dt>
              <dd className="mono">{selected.ms} ms</dd>
              {selected.slug && (
                <>
                  <dt>Project</dt>
                  <dd>
                    <button className="link mono" onClick={() => navigate(`/p/${selected.slug}`)}>
                      {selected.slug}
                    </button>
                  </dd>
                </>
              )}
              <dt>Client</dt>
              <dd>{selected.client ?? '-'}</dd>
            </dl>
            {selected.error && (
              <section>
                <h4>Error</h4>
                <pre className="logs-pre err">{selected.error}</pre>
              </section>
            )}
            {selected.input !== undefined && (
              <section>
                <h4>
                  Input <CopyButton text={pretty(selected.input)} label="Salin input" />
                </h4>
                <pre className="logs-pre mono">{pretty(selected.input)}</pre>
              </section>
            )}
            {selected.output !== undefined && (
              <section>
                <h4>
                  Hasil <CopyButton text={pretty(selected.output)} label="Salin hasil" />
                </h4>
                <pre className="logs-pre mono">{pretty(selected.output)}</pre>
              </section>
            )}
            {selected.input === undefined && selected.output === undefined && !selected.error && <p className="hint">Isi input dan hasil tidak disimpan. Nyalakan di Pengaturan → MCP → Log.</p>}
          </aside>
        )}
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Hapus semua log MCP?"
          message="Semua entri di halaman ini dan file logs/mcp.jsonl dihapus. Tidak bisa dibatalkan."
          confirmLabel="Hapus log"
          danger
          onClose={() => setConfirmClear(false)}
          onConfirm={async () => {
            setConfirmClear(false);
            try {
              await api.clearMcpLogs();
              setSel(null);
              await load();
              toast('ok', 'Log MCP dihapus');
            } catch (e) {
              toast('err', (e as Error).message);
            }
          }}
        />
      )}
      <Toasts />
    </div>
  );
}
