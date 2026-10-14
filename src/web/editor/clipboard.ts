import { addLayer, findPanel, layerFromDrop, pasteFileName } from '../../shared/model';
import { pasteLayers, removeLayers } from '../../shared/multi';
import { panelSpace } from '../../shared/layout';
import { api } from '../api';
import { useEditor } from '../state/editorStore';
import { toast } from '../state/uiStore';

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable);
}

function selectedLayers() {
  const st = useEditor.getState();
  if (!st.project || !st.activePanelId || !st.selectedLayerIds.length) return null;
  const want = new Set(st.selectedLayerIds);
  const layers = findPanel(st.project, st.activePanelId)?.panel.layers.filter((l) => want.has(l.id)) ?? [];
  return layers.length ? { layers, panelId: st.activePanelId } : null;
}

/**
 * Marker written to the system clipboard on Ctrl+C of layers / an asset tile. While it is still there,
 * Ctrl+V pastes our copy even if the OS also offers an older image (Wayland/GNOME keep the last
 * screenshot as a file). Copying anything else outside the app replaces the marker.
 */
export const LAYER_CLIP_MIME = 'text/x-storyboard-clip';
let clipToken = '';

function markClipboard(e: ClipboardEvent): void {
  clipToken = crypto.randomUUID();
  try {
    e.clipboardData?.setData(LAYER_CLIP_MIME, clipToken);
    e.clipboardData?.setData('text/plain', 'storyboard-maker');
  } catch {
    /* some browsers refuse custom types: fall back to the in-app clipboard only */
  }
}

/** our marker is the newest thing on the system clipboard */
function ownsClipboard(e: ClipboardEvent): boolean {
  const d = e.clipboardData;
  if (!d || !clipToken) return false;
  if (d.types.includes(LAYER_CLIP_MIME)) return d.getData(LAYER_CLIP_MIME) === clipToken;
  // custom types can be stripped by the OS clipboard; the plain-text fallback still identifies us
  return d.getData('text/plain') === 'storyboard-maker';
}

export function handleCopy(e: ClipboardEvent): void {
  if (isTypingTarget(e.target)) return;
  if (getSelection()?.toString()) return; // copying visible page text
  const sel = selectedLayers();
  if (!sel) return;
  e.preventDefault();
  markClipboard(e);
  useEditor.getState().setClipboard({ layers: structuredClone(sel.layers), panelId: sel.panelId });
}

export function handleCut(e: ClipboardEvent): void {
  if (useEditor.getState().agentActive) return;
  if (isTypingTarget(e.target)) return;
  const sel = selectedLayers();
  if (!sel) return;
  handleCopy(e);
  const st = useEditor.getState();
  st.apply((p) => removeLayers(p, sel.panelId, sel.layers.map((l) => l.id)));
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
  const ours = ownsClipboard(e) && (!!st.clipboard || !!st.copiedAsset);
  const images = ours ? [] : Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
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
  let ids: string[] = [];
  st.apply((p) => {
    const r = pasteLayers(p, panelId, clip.layers, clip.panelId === panelId);
    ids = r.layerIds;
    return r.project;
  });
  useEditor.getState().setSelection(ids);
}

let onAssetsChanged: (() => void) | null = null;

/** Installs document copy/cut/paste handlers. Returns an uninstall function. */
/** asset panel Ctrl+C uses the same marker */
export { markClipboard };

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
