import { Folder, Globe, Image as ImageIcon, Loader2, MoreHorizontal, Upload, Wallpaper } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Popover } from '../ui/Popover';
import { setPageBackground, updatePanel } from '../../shared/model';
import type { AssetInfo } from '../../shared/types';
import { api, type AssetLists } from '../api';
import { useEditor } from '../state/editorStore';
import { toast } from '../state/uiStore';

export const ASSET_MIME = 'application/x-storyboard-asset';
export const ASSET_BATCH = 30;

export function AssetPanel({ slug, assets, onUploaded }: { slug: string; assets: AssetLists; onUploaded: () => void }) {
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<{ ref: string; el: HTMLElement } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = useEditor();

  const list = assets[scope].filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));
  // infinite list: render a batch, add more when the sentinel scrolls into view
  const [shown, setShown] = useState(ASSET_BATCH);
  const sentinel = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setShown(ASSET_BATCH), [scope, q]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && setShown((n) => n + ASSET_BATCH), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, list.length]);
  const visible = list.slice(0, shown);
  // Ctrl+C / Cmd+C on a selected tile copies the asset; Ctrl+V then drops it into the active scene
  useEffect(() => {
    const copy = (e: ClipboardEvent) => {
      if (!picked) return;
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('.asset-panel') || t.closest('input, textarea')) return;
      const a = [...assets.project, ...assets.global].find((x) => x.ref === picked);
      if (!a) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      useEditor.getState().copyAsset(a);
      toast('info', `${a.name} disalin — Ctrl+V untuk menaruh di scene`);
    };
    document.addEventListener('copy', copy, true);
    return () => document.removeEventListener('copy', copy, true);
  }, [picked, assets]);

  async function upload(files: File[]) {
    const ok = files.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.name));
    if (ok.length < files.length) toast('warn', `${files.length - ok.length} file dilewati (hanya png/jpg/gif/webp)`);
    if (!ok.length) return;
    setBusy(true);
    setErr(null);
    try {
      const done = await api.uploadAssets(scope, ok, slug);
      onUploaded();
      toast('ok', `${done.length} asset di-upload`);
    } catch (e) {
      setErr((e as Error).message);
      toast('err', `Upload gagal: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function setPanelBg(a: AssetInfo) {
    const panelId = s.activePanelId;
    if (!panelId) return;
    s.apply((p) => updatePanel(p, panelId, (pn) => ({ ...pn, background: { kind: 'asset', ref: a.ref, fit: 'cover' } })));
    setMenu(null);
  }

  function setPageBg(a: AssetInfo) {
    const p = s.project;
    if (!p) return;
    const pi = s.currentPageIndex();
    if (pi < 0) return; // cover has no page background of its own
    const bg = { kind: 'asset', ref: a.ref, fit: 'cover' } as const;
    s.apply((q) => setPageBackground(q, pi, bg));
    setMenu(null);
  }

  return (
    <div
      className={`asset-panel ${over ? 'drop-over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        upload(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="seg full">
        <button className={scope === 'project' ? 'on' : ''} onClick={() => setScope('project')}>
          <Folder size={14} aria-hidden /> Project <span className="mono muted">{assets.project.length}</span>
        </button>
        <button className={scope === 'global' ? 'on' : ''} onClick={() => setScope('global')}>
          <Globe size={14} aria-hidden /> Global <span className="mono muted">{assets.global.length}</span>
        </button>
      </div>
      <div className="row">
        <input data-native-undo placeholder="Cari asset…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <><Loader2 size={14} className="spin" aria-hidden /> Upload</> : <><Upload size={14} aria-hidden /> Upload</>}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.gif,.webp"
          hidden
          onChange={(e) => {
            upload(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>
      {err && <div className="error">{err}</div>}
      <div className="hint muted">Tarik file ke sini untuk upload. Tarik thumbnail ke scene, atau pilih lalu Ctrl+C → Ctrl+V.</div>
      <div className="asset-scroll">
      <div className="asset-grid">
        {visible.map((a) => (
          <div
            key={a.ref}
            className={`asset${picked === a.ref ? ' picked' : ''}`}
            tabIndex={0}
            data-asset-tile="1"
            onClick={() => setPicked(a.ref)}
            onFocus={() => setPicked(a.ref)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ASSET_MIME, JSON.stringify(a));
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title={`${a.name} · ${a.width}×${a.height}`}
          >
            <div className="thumb">
              <img src={a.url} alt={a.name} loading="lazy" draggable={false} />
            </div>
            <div className="asset-name">{a.name}</div>
            <button
              className={`ib sm asset-more${menu?.ref === a.ref ? ' open' : ''}`}
              onClick={(e) => setMenu(menu?.ref === a.ref ? null : { ref: a.ref, el: e.currentTarget })}
              title="Jadikan background"
              aria-label="Menu asset"
            >
              <MoreHorizontal size={14} aria-hidden />
            </button>
            {menu?.ref === a.ref && (
              <Popover anchor={menu.el} open onClose={() => setMenu(null)} width={230} height={240} align="end" className="menu-list asset-menu">
                <div className="asset-menu-head">
                  <span className="thumb">
                    <img src={a.url} alt="" draggable={false} />
                  </span>
                  <div className="asset-menu-meta">
                    <div className="ellipsis">{a.name}</div>
                    <div className="muted mono small">
                      {a.width}×{a.height}
                    </div>
                  </div>
                </div>
                <button onClick={() => setPanelBg(a)}><ImageIcon size={14} aria-hidden /> {s.selectedCover ? 'Jadikan background frame cover' : 'Jadikan background scene'}</button>
                <button onClick={() => setPageBg(a)} disabled={s.selectedCover} title={s.selectedCover ? 'Cover memakai background default project (atur di panel Properti)' : ''}>
                  <Wallpaper size={14} aria-hidden /> Jadikan background page
                </button>
              </Popover>
            )}
          </div>
        ))}
        {!list.length && <div className="muted pad-s">{q ? `Tidak ada asset "${q}".` : 'Belum ada asset.'}</div>}
      </div>
      {shown < list.length && (
        <div ref={sentinel} className="asset-more-row muted small">
          Memuat… <span className="mono">{shown}/{list.length}</span>
        </div>
      )}
      </div>
    </div>
  );
}
