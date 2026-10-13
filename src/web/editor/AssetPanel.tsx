import { useRef, useState } from 'react';
import { Popover } from '../ui/Popover';
import { setPageBackground, updatePanel } from '../../shared/model';
import type { AssetInfo } from '../../shared/types';
import { api, type AssetLists } from '../api';
import { useEditor } from '../state/editorStore';
import { toast } from '../state/uiStore';

export const ASSET_MIME = 'application/x-storyboard-asset';

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
      <div className="seg">
        <button className={scope === 'project' ? 'on' : ''} onClick={() => setScope('project')}>
          Project <span className="mono muted">{assets.project.length}</span>
        </button>
        <button className={scope === 'global' ? 'on' : ''} onClick={() => setScope('global')}>
          Global <span className="mono muted">{assets.global.length}</span>
        </button>
      </div>
      <div className="row">
        <input data-native-undo placeholder="Cari asset…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => input.current?.click()} disabled={busy}>
          {busy ? '…' : 'Upload'}
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
      <div className="hint muted">Tarik file dari file manager ke sini untuk upload. Tarik thumbnail ke scene untuk menaruh.</div>
      <div className="asset-grid">
        {list.map((a) => (
          <div
            key={a.ref}
            className="asset"
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
              className={`asset-more${menu?.ref === a.ref ? ' open' : ''}`}
              onClick={(e) => setMenu(menu?.ref === a.ref ? null : { ref: a.ref, el: e.currentTarget })}
              title="Jadikan background"
            >
              ⋯
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
                <button onClick={() => setPanelBg(a)}>{s.selectedCover ? 'Jadikan background frame cover' : 'Jadikan background scene'}</button>
                <button onClick={() => setPageBg(a)} disabled={s.selectedCover} title={s.selectedCover ? 'Cover memakai background default project (atur di panel Properti)' : ''}>
                  Jadikan background page
                </button>
              </Popover>
            )}
          </div>
        ))}
        {!list.length && <div className="muted pad-s">Belum ada asset.</div>}
      </div>
    </div>
  );
}
