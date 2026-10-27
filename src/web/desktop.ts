import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openPath, openUrl as openExternal } from '@tauri-apps/plugin-opener';
import { api } from './api';

/** Native desktop features inside the Tauri shell; browser fallbacks otherwise. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Native "choose folder" dialog; in a browser the user types the path. null = cancelled. */
export async function pickFolder(current: string): Promise<string | null> {
  if (!isDesktop) return prompt('Path folder penyimpanan (lengkap):', current)?.trim() || null;
  const dir = await open({ directory: true, multiple: false, defaultPath: current, title: 'Pilih folder penyimpanan' });
  return typeof dir === 'string' ? dir : null;
}

/** File chooser for a project .zip (the webview shows the OS dialog). null = cancelled. */
export function pickZip(): Promise<File | null> {
  const { promise, resolve } = Promise.withResolvers<File | null>();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,application/zip';
  input.onchange = () => resolve(input.files?.[0] ?? null);
  input.oncancel = () => resolve(null);
  input.click();
  return promise;
}

/** Native "save as" for a project archive; the browser just downloads it. null = cancelled. */
export async function saveZip(slug: string): Promise<string | null> {
  if (!isDesktop) {
    const a = document.createElement('a');
    a.href = `/api/projects/${slug}/export.zip`;
    a.download = `${slug}.storyboard.zip`;
    a.click();
    return `${slug}.storyboard.zip`;
  }
  const path = await save({ defaultPath: `${slug}.storyboard.zip`, filters: [{ name: 'Storyboard project', extensions: ['zip'] }], title: 'Export project' });
  return path ? (await api.exportProjectZipTo(slug, path)).path : null;
}

/** Opens a server URL (PDF, preview) in the OS default app on desktop, a new tab otherwise. */
export async function openUrl(path: string): Promise<void> {
  const url = new URL(path, location.origin).href;
  if (isDesktop) await openExternal(url);
  else window.open(url, '_blank');
}

/** Shows a local folder in the OS file manager (desktop only). */
export async function revealFolder(dir: string): Promise<void> {
  if (isDesktop) await openPath(dir);
}

/** Only local image files from an OS text/uri-list, never web or remote file URLs. */
export function localImageUris(text: string): string[] {
  const uris: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#') || !/^file:\/\//i.test(value)) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost') || url.search || url.hash) continue;
      if (!/\.(png|jpe?g|gif|webp)$/i.test(decodeURIComponent(url.pathname))) continue;
      url.hostname = '';
      uris.push(url.href);
    } catch {
      // A malformed URI is not a local image drag.
    }
  }
  return uris;
}

/** Narrow native command; browser uploads must keep using the actual File objects. */
export async function readLocalImages(uris: string[]): Promise<File[]> {
  if (!isDesktop) return [];
  const local = localImageUris(uris.join('\n'));
  if (!local.length) return [];
  const images = await invoke<{ name: string; mime: string; bytes: number[] }[]>('read_local_images', { uris: local });
  return images.map((image) => new File([new Uint8Array(image.bytes)], image.name, { type: image.mime }));
}
