import { AlertTriangle, ArrowLeft, Check, Eye, FileDown, Loader2, Redo2, Shapes, Smile, Type, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { addLayer, defaultEmoji, defaultShape, defaultText } from '../../shared/model';
import { ShapeMenu } from './ShapeMenu';
import { Popover, useAnchor } from '../ui/Popover';
import { panelSpace } from '../../shared/layout';
import type { Layer } from '../../shared/types';
import { api } from '../api';
import { navigate } from '../router';
import { openUrl } from '../desktop';
import { AgentBadge } from './AgentBadge';
import { ThemeToggle } from '../ui/ThemeToggle';
import { SettingsButton } from '../ui/SettingsDialog';
import { useEditor } from '../state/editorStore';
import { toast } from '../state/uiStore';

export const EMOJIS = ['🔥', '❄️', '💧', '❌', '✅', '❓', '❗', '😱', '💨', '⚡', '💀', '👆'];

const STATUS: Record<string, string> = {
  saved: 'Tersimpan',
  saving: 'Menyimpan…',
  dirty: 'Belum disimpan',
  error: 'Gagal simpan — coba lagi',
};

export function Toolbar({ slug }: { slug: string }) {
  const s = useEditor();
  const emoji = useAnchor<HTMLButtonElement>();
  const shape = useAnchor<HTMLButtonElement>();
  const [exporting, setExporting] = useState(false);

  const scene = s.selectedCover && s.project?.cover ? { split: false, panels: [s.project.cover.panel] } : s.project?.pages.flatMap((p) => p.scenes).find((x) => x.id === s.currentSceneId);
  const panel = scene?.panels.find((p) => p.id === s.activePanelId) ?? scene?.panels[0];
  const space = panelSpace(!!scene?.split);

  function insert(layer: Layer) {
    if (!panel) return;
    s.apply((p) => addLayer(p, panel.id, layer));
    s.setActivePanel(panel.id);
    s.selectLayer(layer.id);
  }

  function pageOfCurrent() {
    return s.currentPageIndex();
  }

  async function doExport() {
    setExporting(true);
    try {
      await s.settle();
      const r = await api.exportPdf(slug);
      const link = { href: `/api/projects/${slug}/export.pdf`, label: 'Buka PDF' };
      toast('ok', `PDF dibuat: ${r.path}`, link);
      if (r.missingAssets.length) toast('warn', `${r.missingAssets.length} asset hilang: ${r.missingAssets.join(', ')}`);
      if (r.missingFonts?.length) toast('warn', `Font tidak tersedia (pakai font pengganti): ${r.missingFonts.join(', ')}`);
    } catch (e) {
      toast('err', `Export gagal: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="toolbar">
      <button onClick={async () => { await s.settle(); navigate('/'); }}><ArrowLeft size={14} aria-hidden /> Projects</button>
      <span className="project-name">{s.project?.name}</span>
      <span className="sep" />
      <button onClick={s.undo} disabled={s.agentActive || !s.past.length} title="Undo (Ctrl+Z)">
        <Undo2 size={14} aria-hidden /> Undo
      </button>
      <button onClick={s.redo} disabled={s.agentActive || !s.future.length} title="Redo (Ctrl+Shift+Z)">
        <Redo2 size={14} aria-hidden /> Redo
      </button>
      <span className="sep" />
      <button onClick={() => insert(defaultText(space))} disabled={s.agentActive} title="Tambah teks">
        <Type size={14} aria-hidden /> Teks
      </button>
      <button ref={shape.ref} className={shape.open ? 'on' : ''} onClick={shape.toggle} disabled={s.agentActive} title="Tambah shape">
        <Shapes size={14} aria-hidden /> Shape
      </button>
      <Popover anchor={shape.el} open={shape.open} onClose={shape.close} width={280} height={300}>
        <ShapeMenu
          onPick={(k) => {
            insert(defaultShape(k, space));
            shape.close();
          }}
        />
      </Popover>
      <button ref={emoji.ref} className={emoji.open ? 'on' : ''} onClick={emoji.toggle} disabled={s.agentActive} title="Tambah emoji">
        <Smile size={14} aria-hidden /> Emoji
      </button>
      <Popover anchor={emoji.el} open={emoji.open} onClose={emoji.close} width={232} height={160}>
        <div className="emoji-menu">
          {EMOJIS.map((c) => (
            <button
              key={c}
              onClick={() => {
                insert(defaultEmoji(c, space));
                emoji.close();
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </Popover>
      <div className="grow" />
      <AgentBadge />
      <ThemeToggle />
      <SettingsButton />
      <span className={`save-status ${s.saveStatus}`} title={s.saveError ?? ''}>
        {s.saveStatus === 'saved' ? <Check size={13} aria-hidden /> : s.saveStatus === 'error' ? <AlertTriangle size={13} aria-hidden /> : <Loader2 size={13} className="spin" aria-hidden />}
        {STATUS[s.saveStatus]}
      </span>
      <button onClick={async () => { await s.settle(); await openUrl(`/print/${slug}?page=${pageOfCurrent()}`); }}>
        <Eye size={14} aria-hidden /> Preview Page
      </button>
      <button className="primary" onClick={doExport} disabled={exporting}>
        {exporting ? <><Loader2 size={14} className="spin" aria-hidden /> Mengekspor…</> : <><FileDown size={14} aria-hidden /> Export PDF</>}
      </button>
    </header>
  );
}
