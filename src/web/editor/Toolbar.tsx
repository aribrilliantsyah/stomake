import { useState } from 'react';
import { addLayer, defaultArrow, defaultEmoji, defaultText } from '../../shared/model';
import { panelSpace } from '../../shared/layout';
import type { Layer } from '../../shared/types';
import { api } from '../api';
import { navigate } from '../router';
import { useEditor } from '../state/editorStore';

export const EMOJIS = ['🔥', '❄️', '💧', '❌', '✅', '❓', '❗', '😱', '💨', '⚡', '💀', '👆'];

const STATUS: Record<string, string> = {
  saved: 'Tersimpan',
  saving: 'Menyimpan…',
  dirty: 'Belum disimpan',
  error: 'Gagal simpan — coba lagi',
};

export function Toolbar({ slug }: { slug: string }) {
  const s = useEditor();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const scene = s.project?.pages.flatMap((p) => p.scenes).find((x) => x.id === s.currentSceneId);
  const panel = scene?.panels.find((p) => p.id === s.activePanelId) ?? scene?.panels[0];
  const space = panelSpace(!!scene?.split);

  function insert(layer: Layer) {
    if (!panel) return;
    s.apply((p) => addLayer(p, panel.id, layer));
    s.setActivePanel(panel.id);
    s.selectLayer(layer.id);
  }

  function pageOfCurrent() {
    const pages = s.project?.pages ?? [];
    return Math.max(0, pages.findIndex((p) => p.scenes.some((x) => x.id === s.currentSceneId)));
  }

  async function doExport() {
    setExporting(true);
    setToast(null);
    try {
      await s.flush();
      const r = await api.exportPdf(slug);
      if (r.missingAssets.length)
        setToast({ kind: 'warn', text: `PDF dibuat, tapi ${r.missingAssets.length} asset hilang: ${r.missingAssets.join(', ')}` });
      else setToast({ kind: 'ok', text: `PDF dibuat: ${r.path}` });
    } catch (e) {
      setToast({ kind: 'err', text: `Export gagal: ${(e as Error).message}` });
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="toolbar">
      <button onClick={async () => { await s.flush(); navigate('/'); }}>← Projects</button>
      <span className="project-name">{s.project?.name}</span>
      <span className="sep" />
      <button onClick={s.undo} disabled={!s.past.length} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button onClick={s.redo} disabled={!s.future.length} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
      <span className="sep" />
      <button onClick={() => insert(defaultText(space))} title="Tambah teks">
        T Teks
      </button>
      <button onClick={() => insert(defaultArrow(space))} title="Tambah panah">
        ↑ Panah
      </button>
      <div className="menu-wrap">
        <button onClick={() => setEmojiOpen((v) => !v)} title="Tambah emoji">
          😀 Emoji
        </button>
        {emojiOpen && (
          <div className="menu emoji-menu" onMouseLeave={() => setEmojiOpen(false)}>
            {EMOJIS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  insert(defaultEmoji(c, space));
                  setEmojiOpen(false);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grow" />
      <span className={`save-status ${s.saveStatus}`} title={s.saveError ?? ''}>
        {STATUS[s.saveStatus]}
      </span>
      <button onClick={async () => { await s.flush(); window.open(`/print/${slug}?page=${pageOfCurrent()}`, '_blank'); }}>
        Preview Page
      </button>
      <button className="primary" onClick={doExport} disabled={exporting}>
        {exporting ? 'Mengekspor…' : 'Export PDF'}
      </button>
      {toast && (
        <div className={`toast ${toast.kind}`}>
          <span>{toast.text}</span>
          {toast.kind !== 'err' && (
            <a href={`/api/projects/${slug}/export.pdf`} target="_blank" rel="noreferrer">
              Buka PDF
            </a>
          )}
          <button onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </header>
  );
}
