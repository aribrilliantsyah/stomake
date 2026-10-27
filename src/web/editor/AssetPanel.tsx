import { getCurrentWebview } from '@tauri-apps/api/webview';
import { Folder, Globe, Image as ImageIcon, Loader2, MoreHorizontal, Trash2, Upload, Wallpaper } from 'lucide-react';
import { ConfirmDialog } from '../ui/Dialog';
import { useEffect, useRef, useState } from 'react';
import { Popover } from '../ui/Popover';
import { markClipboard } from './clipboard';
import { ASSET_MIME, captureAssetDrop, endAssetDrag, isAssetDrag, isFileDrag, startAssetDrag } from './assetDrag';
export { ASSET_MIME };
import { setPageBackground, updatePanel } from '../../shared/model';
import type { AssetInfo } from '../../shared/types';
import { api, type AssetLists } from '../api';
import { isDesktop, readLocalImages } from '../desktop';
import { useEditor } from '../state/editorStore';
import { toast } from '../state/uiStore';

export const ASSET_BATCH = 30;

export function AssetPanel({ slug, assets, onUploaded }: { slug: string; assets: AssetLists; onUploaded: () => void }) {
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const panelElement = useRef<HTMLDivElement>(null);
  const uploadContext = useRef({ slug, active: true });
  if (uploadContext.current.slug !== slug) uploadContext.current = { slug, active: true };
  useEffect(() => {
    const context = uploadContext.current;
    context.active = true;
    setBusy(false);
    setErr(null);
    return () => { context.active = false; };
  }, [slug]);
  // dragenter/leave fire for every child; count them so the drop zone doesn't flicker or stick
  const depth = useRef(0);
  // watchdog: dragover fires every ~50 ms while a file hovers; if it stops (Esc, drop elsewhere,
  // pointer left the window) without a dragleave reaching us, hide the drop zone anyway
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideZone = () => {
    depth.current = 0;
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    setOver(false);
  };
  useEffect(() => {
    window.addEventListener('dragend', hideZone, true);
    window.addEventListener('drop', hideZone, true);
    return () => {
      window.removeEventListener('dragend', hideZone, true);
      window.removeEventListener('drop', hideZone, true);
      if (idle.current) clearTimeout(idle.current);
    };
  }, []);
  const [menu, setMenu] = useState<{ ref: string; el: HTMLElement } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = useEditor();
  const [confirmDel, setConfirmDel] = useState<{ asset: AssetInfo; usage: { slug: string; name: string; count: number }[] } | null>(null);

  async function askDelete(a: AssetInfo) {
    setMenu(null);
    let usage: { slug: string; name: string; count: number }[] = [];
    try {
      usage = await api.assetUsage(a.ref, slug);
    } catch {
      /* show the dialog anyway */
    }
    setConfirmDel({ asset: a, usage });
  }

  async function doDelete(a: AssetInfo) {
    try {
      const { trashId } = await api.deleteAsset(a.ref, slug);
      if (picked === a.ref) setPicked(null);
      onUploaded();
      toast('ok', `"${a.name}" dihapus`, undefined, {
        label: 'Urungkan',
        run: async () => {
          try {
            const back = await api.restoreAsset(trashId);
            onUploaded();
            toast('ok', back.name === a.name ? `"${a.name}" dipulihkan` : `Dipulihkan sebagai "${back.name}"`);
          } catch (e) {
            toast('err', `Gagal memulihkan: ${(e as Error).message}`);
          }
        },
      });
    } catch (e) {
      toast('err', `Gagal menghapus: ${(e as Error).message}`);
    }
  }

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
      markClipboard(e);
      useEditor.getState().copyAsset(a);
      toast('info', `${a.name} disalin — Ctrl+V untuk menaruh di scene`);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' || !picked) return;
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('.asset[data-asset-tile]')) return;
      const a = [...assets.project, ...assets.global].find((x) => x.ref === picked);
      if (!a) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void askDelete(a);
    };
    document.addEventListener('copy', copy, true);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('copy', copy, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [picked, assets]);

  async function upload(files: File[], uris: string[] = []) {
    const context = uploadContext.current;
    setBusy(true);
    setErr(null);
    try {
      const received = files.length ? files : await readLocalImages(uris);
      if (!context.active || uploadContext.current !== context) return;
      const ok = received.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.name));
      if (ok.length < received.length) toast('warn', `${received.length - ok.length} file dilewati (hanya png/jpg/gif/webp)`);
      if (!ok.length) return;
      const done = await api.uploadAssets(scope, ok, slug);
      if (!context.active || uploadContext.current !== context) return;
      onUploaded();
      toast('ok', `${done.length} asset di-upload`);
    } catch (e) {
      if (!context.active || uploadContext.current !== context) return;
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
      toast('err', `Upload gagal: ${message}`);
    } finally {
      if (context.active && uploadContext.current === context) setBusy(false);
    }
  }

  const nativeUpload = useRef(upload);
  nativeUpload.current = upload;
  useEffect(() => {
    if (!isDesktop || !/Linux/i.test(navigator.platform)) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview().listen<{ uris: string[]; position: { x: number; y: number } }>('storyboard://file-drop', ({ payload }) => {
      if (!active) return;
      const panel = panelElement.current;
      if (!panel || panel.closest('[hidden]') || isAssetDrag(null)) { hideZone(); return; }
      const rect = panel.getBoundingClientRect();
      // The external-only GTK bridge emits widget-local coordinates in logical CSS pixels.
      const { x, y } = payload.position;
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) { hideZone(); return; }
      hideZone();
      void nativeUpload.current([], payload.uris);
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    }).catch((error) => {
      if (active) toast('err', `Upload gagal: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; unlisten?.(); };
  }, []);

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
      ref={panelElement}
      className={`asset-panel${over ? ' drop-over' : ''}`}
      onDragEnter={(e) => {
        if (!isFileDrag(e.dataTransfer)) return;
        depth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        // only OS files are an upload; our own tiles dragged over the panel are ignored (no drop here)
        if (!isFileDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
        if (idle.current) clearTimeout(idle.current);
        idle.current = setTimeout(hideZone, 400);
      }}
      onDragLeave={(e) => {
        if (!isFileDrag(e.dataTransfer)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) hideZone();
      }}
      onDrop={(e) => {
        hideZone();
        if (!isFileDrag(e.dataTransfer)) return;
        const captured = captureAssetDrop(e.dataTransfer);
        if (!captured.files.length && !captured.uris.length) return;
        e.preventDefault();
        void upload(captured.files, captured.uris);
      }}
    >
      {over && (
        <div className="drop-zone" aria-hidden>
          <Upload size={18} aria-hidden />
          <span>Lepas untuk upload ke {scope === 'project' ? 'Project' : 'Global'}</span>
        </div>
      )}
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
            onDragStart={(e) => startAssetDrag(a, e.dataTransfer)}
            onDragEnd={endAssetDrag}
            title={`${a.name} · ${a.width}×${a.height}`}
          >
            <div className="thumb">
              <img src={a.url} alt={a.name} loading="lazy" draggable={false} />
            </div>
            <div className="asset-name">{a.name}</div>
            <button
              className={`ib sm asset-more${menu?.ref === a.ref ? ' open' : ''}`}
              onClick={(e) => setMenu(menu?.ref === a.ref ? null : { ref: a.ref, el: e.currentTarget })}
              title="Menu asset"
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
                <div className="menu-sep" />
                <button className="danger" onClick={() => void askDelete(a)} disabled={s.agentActive}>
                  <Trash2 size={14} aria-hidden /> Hapus asset…
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
      {confirmDel && (
        <ConfirmDialog
          title="Hapus asset?"
          danger
          confirmLabel="Hapus"
          onClose={() => setConfirmDel(null)}
          onConfirm={() => void doDelete(confirmDel.asset)}
          message={
            <div className="del-asset">
              <div className="asset-menu-head">
                <span className="thumb">
                  <img src={confirmDel.asset.url} alt="" draggable={false} />
                </span>
                <div className="asset-menu-meta">
                  <div className="ellipsis">{confirmDel.asset.name}</div>
                  <div className="muted mono small">
                    {confirmDel.asset.ref.startsWith('global:') ? 'Global' : 'Project'} · {confirmDel.asset.width}×{confirmDel.asset.height}
                  </div>
                </div>
              </div>
              {confirmDel.usage.length ? (
                <p className="warn-text">
                  Masih dipakai di{' '}
                  {confirmDel.usage.map((u, i) => (
                    <span key={u.slug}>
                      {i ? ', ' : ''}
                      <b>{u.name}</b> <span className="mono">({u.count}×)</span>
                    </span>
                  ))}
                  . Layer itu akan tampil sebagai &quot;hilang&quot; sampai asset dipulihkan.
                </p>
              ) : (
                <p className="muted">Tidak dipakai di scene mana pun.</p>
              )}
              <p className="muted small">File dipindah ke Sampah dan bisa diurungkan dari notifikasi.</p>
            </div>
          }
        />
      )}
    </div>
  );
}
