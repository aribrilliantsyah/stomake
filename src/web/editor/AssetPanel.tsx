import { useRef, useState } from 'react';
import { setPageBackground, updatePanel } from '../../shared/model';
import type { AssetInfo } from '../../shared/types';
import { api, type AssetLists } from '../api';
import { useEditor } from '../state/editorStore';

export const ASSET_MIME = 'application/x-storyboard-asset';

export function AssetPanel({ slug, assets, onUploaded }: { slug: string; assets: AssetLists; onUploaded: () => void }) {
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = useEditor();

  const list = assets[scope].filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  async function upload(files: File[]) {
    const ok = files.filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f.name));
    if (!ok.length) return;
    setBusy(true);
    setErr(null);
    try {
      await api.uploadAssets(scope, ok, slug);
      onUploaded();
    } catch (e) {
      setErr((e as Error).message);
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
    const bg = { kind: 'asset', ref: a.ref, fit: 'cover' } as const;
    s.apply((q) => (pi < 0 ? { ...q, pageBackground: bg } : setPageBackground(q, pi, bg)));
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
        <input placeholder="Cari asset…" value={q} onChange={(e) => setQ(e.target.value)} />
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
            <button className="asset-more" onClick={() => setMenu(menu === a.ref ? null : a.ref)} title="Jadikan background">
              ⋯
            </button>
            {menu === a.ref && (
              <div className="menu asset-menu" onMouseLeave={() => setMenu(null)}>
                <button onClick={() => setPanelBg(a)}>Jadikan background scene</button>
                <button onClick={() => setPageBg(a)}>Jadikan background page</button>
              </div>
            )}
          </div>
        ))}
        {!list.length && <div className="muted pad-s">Belum ada asset.</div>}
      </div>
    </div>
  );
}
