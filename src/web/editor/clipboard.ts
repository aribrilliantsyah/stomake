import { readImage, readText } from '@tauri-apps/plugin-clipboard-manager';
import { addLayer, findPanel, layerFromDrop, pasteFileName } from '../../shared/model';
import { pasteLayers, removeLayers } from '../../shared/multi';
import { panelSpace } from '../../shared/layout';
import { api } from '../api';
import { isDesktop, localImageUris, readLocalImages } from '../desktop';
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
    e.clipboardData?.setData('text/plain', `stomake:${clipToken}`);
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
  return d.getData('text/plain') === `stomake:${clipToken}`;
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

// arboard returns this documented error for a missing text/image format, not an actual failure.
function emptyClipboard(err: unknown): boolean {
  return String(err).includes('The clipboard contents were not available in the requested format or the clipboard is empty.');
}

async function nativeClipboardImage(): Promise<File | null> {
  let image;
  try {
    image = await readImage();
  } catch (err) {
    if (emptyClipboard(err)) return null;
    throw err;
  }
  if (!image) return null;
  try {
    const [rgba, size] = await Promise.all([image.rgba(), image.size()]);
    if (!size.width || !size.height || !rgba.length) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas tidak tersedia');
    const pixels = ctx.createImageData(size.width, size.height);
    pixels.data.set(rgba);
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Gagal membuat PNG clipboard')), 'image/png'));
    return new File([blob], pasteFileName(new Date()), { type: 'image/png' });
  } finally {
    await image.close();
  }
}
export async function handlePaste(e: ClipboardEvent): Promise<void> {
  if (isTypingTarget(e.target)) return;
  const st = useEditor.getState();
  if (st.agentActive) return;
  const panelId = st.activePanelId;
  if (!st.project || !st.slug || !panelId) return;
  // Snapshot the event and the destination before any native clipboard IPC.
  let ours = ownsClipboard(e) && (!!st.clipboard || !!st.copiedAsset);
  let images = ours ? [] : Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
  const eventText = e.clipboardData?.getData('text/plain') ?? '';
  const eventHasData = !!e.clipboardData?.types.length || !!e.clipboardData?.files.length;
  const slug = st.slug;
  const project = st.project;
  let contextChanged = false;
  const unsubscribe = useEditor.subscribe((next) => {
    if (next.slug !== slug || next.activePanelId !== panelId || !next.project || next.project.createdAt !== project.createdAt || next.agentActive) contextChanged = true;
  });
  try {
    if (images.length || ours || (isDesktop && !eventHasData)) e.preventDefault();
    if (!ours && !images.length && isDesktop) {
      let text = eventText;
      let textError: unknown;
      try {
        text = await readText();
      } catch (err) {
        if (!emptyClipboard(err)) textError = err;
      }
      if (contextChanged) return;
      ours = !!clipToken && text === `stomake:${clipToken}` && (!!st.clipboard || !!st.copiedAsset);
      if (!ours) {
        const uris = localImageUris(text);
        if (uris.length) images = await readLocalImages(uris);
        else {
          const image = await nativeClipboardImage();
          if (image) images = [image];
        }
      }
      if (!ours && !images.length && textError !== undefined) throw textError;
    }
    if (contextChanged) return;
    if (images.length) {
      e.preventDefault();
      const named = images.map((f, i) => new File([f], i === 0 ? pasteFileName(new Date()) : pasteFileName(new Date()).replace('.png', `-${i + 1}.png`), { type: f.type }));
      const infos = await api.uploadClips(slug, named);
      if (contextChanged) return;
      const space = panelSpace(isSplitPanel(panelId));
      for (const info of infos) {
        const layer = layerFromDrop(info, space.w / 2, space.h / 2, space);
        useEditor.getState().apply((p) => addLayer(p, panelId, layer));
        useEditor.getState().selectLayer(layer.id);
      }
      return;
    }
    // Only browsers with an entirely empty event retain the historical in-app fallback.
    if (!ours && (isDesktop || eventHasData || eventText)) return;
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
  } catch (err) {
    if (!contextChanged) toast('err', `Gagal menempel gambar: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    unsubscribe();
  }
}

let onAssetsChanged: (() => void) | null = null;

/** Installs document copy/cut/paste handlers. Returns an uninstall function. */
/** asset panel Ctrl+C uses the same marker */
export { markClipboard };

export function installClipboard(_slug: string, assetsChanged: () => void): () => void {
  onAssetsChanged = assetsChanged;
  const paste = (e: ClipboardEvent) => void handlePaste(e);
  const keydown = (e: KeyboardEvent) => {
    if (!isDesktop || e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'v' || isTypingTarget(e.target)) return;
    const st = useEditor.getState();
    if (!st.project || !st.slug || !st.activePanelId || st.agentActive) return;
    // WebKit does not dispatch paste on a non-editable canvas. Cancel its default action so
    // platforms that do emit paste cannot apply the same clipboard twice.
    e.preventDefault();
    void handlePaste(new ClipboardEvent('paste', { cancelable: true }));
  };
  document.addEventListener('copy', handleCopy);
  document.addEventListener('cut', handleCut);
  document.addEventListener('paste', paste);
  document.addEventListener('keydown', keydown, true);
  return () => {
    document.removeEventListener('copy', handleCopy);
    document.removeEventListener('cut', handleCut);
    document.removeEventListener('paste', paste);
    document.removeEventListener('keydown', keydown, true);
    onAssetsChanged = null;
  };
}
