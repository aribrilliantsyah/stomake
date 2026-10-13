import { addLayer, findPanel, layerFromDrop, pasteFileName, pasteLayer, removeLayer } from '../../shared/model';
import { panelSpace } from '../../shared/layout';
import { api } from '../api';
import { useEditor } from '../state/editorStore';
import { toast } from '../state/uiStore';

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable);
}

function selectedLayer() {
  const st = useEditor.getState();
  if (!st.project || !st.activePanelId || !st.selectedLayerId) return null;
  const layer = findPanel(st.project, st.activePanelId)?.panel.layers.find((l) => l.id === st.selectedLayerId);
  return layer ? { layer, panelId: st.activePanelId } : null;
}

export function handleCopy(e: ClipboardEvent): void {
  if (isTypingTarget(e.target)) return;
  if (getSelection()?.toString()) return; // copying visible page text
  const sel = selectedLayer();
  if (!sel) return;
  e.preventDefault();
  useEditor.getState().setClipboard({ layer: structuredClone(sel.layer), panelId: sel.panelId });
}

export function handleCut(e: ClipboardEvent): void {
  if (useEditor.getState().agentActive) return;
  if (isTypingTarget(e.target)) return;
  const sel = selectedLayer();
  if (!sel) return;
  handleCopy(e);
  const st = useEditor.getState();
  st.apply((p) => removeLayer(p, sel.panelId, sel.layer.id));
  st.selectLayer(null);
}

function isSplitPanel(panelId: string): boolean {
  const p = useEditor.getState().project;
  return !!p && !!findPanel(p, panelId)?.scene?.split;
}

export async function handlePaste(e: ClipboardEvent): Promise<void> {
  if (isTypingTarget(e.target)) return;
  const st = useEditor.getState();
  if (st.agentActive) return;
  const panelId = st.activePanelId;
  if (!st.project || !st.slug || !panelId) return;
  const images = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
  if (images.length) {
    e.preventDefault();
    const slug = st.slug;
    try {
      const named = images.map((f, i) => new File([f], i === 0 ? pasteFileName(new Date()) : pasteFileName(new Date()).replace('.png', `-${i + 1}.png`), { type: f.type }));
      const infos = await api.uploadClips(slug, named);
      const space = panelSpace(isSplitPanel(panelId));
      for (const info of infos) {
        const layer = layerFromDrop(info, space.w / 2, space.h / 2, space);
        useEditor.getState().apply((p) => addLayer(p, panelId, layer));
        useEditor.getState().selectLayer(layer.id);
      }
    } catch (err) {
      toast('err', `Gagal menempel gambar: ${(err as Error).message}`);
    }
    return;
  }
  if (st.copiedAsset) {
    e.preventDefault();
    const space = panelSpace(isSplitPanel(panelId));
    const layer = layerFromDrop(st.copiedAsset, space.w / 2, space.h / 2, space);
    st.apply((p) => addLayer(p, panelId, layer));
    useEditor.getState().selectLayer(layer.id);
    return;
  }
  const clip = st.clipboard;
  if (!clip) return;
  e.preventDefault();
  let newId = '';
  st.apply((p) => {
    const r = pasteLayer(p, panelId, clip.layer, clip.panelId === panelId);
    newId = r.layerId;
    return r.project;
  });
  useEditor.getState().selectLayer(newId);
}

let onAssetsChanged: (() => void) | null = null;

/** Installs document copy/cut/paste handlers. Returns an uninstall function. */
export function installClipboard(_slug: string, assetsChanged: () => void): () => void {
  onAssetsChanged = assetsChanged;
  const paste = (e: ClipboardEvent) => void handlePaste(e);
  document.addEventListener('copy', handleCopy);
  document.addEventListener('cut', handleCut);
  document.addEventListener('paste', paste);
  return () => {
    document.removeEventListener('copy', handleCopy);
    document.removeEventListener('cut', handleCut);
    document.removeEventListener('paste', paste);
    onAssetsChanged = null;
  };
}
