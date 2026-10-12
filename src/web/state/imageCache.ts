import { useEffect, useState } from 'react';
import type { AssetRef } from '../../shared/types';

const cache = new Map<string, Promise<HTMLImageElement | null>>();
const resolved = new Map<string, HTMLImageElement | null>();

/** Assets that failed to load, by ref — read by the print route for missingAssets. */
export const missingRefs = new Set<string>();

export function clearImageCache() {
  cache.clear();
  resolved.clear();
  missingRefs.clear();
}

export function assetUrl(ref: AssetRef, slug: string): string {
  const i = ref.indexOf(':');
  const scope = ref.slice(0, i);
  const name = encodeURIComponent(ref.slice(i + 1));
  return scope === 'global' ? `/files/global/${name}` : `/files/project/${slug}/${name}`;
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    }).then((img) => {
      resolved.set(url, img as HTMLImageElement | null);
      // failures are not cached: a later re-upload of the same name must load
      if (!img) queueMicrotask(() => cache.delete(url));
      return img as HTMLImageElement | null;
    });
    cache.set(url, p);
  }
  return p;
}

/** Drop a cached URL (e.g. after re-upload) so the next use reloads it. */
export function invalidateImage(url: string) {
  cache.delete(url);
  resolved.delete(url);
}

/** Number of image loads still in flight — the print route waits for 0. */
export function pendingImages(): number {
  let n = 0;
  for (const url of cache.keys()) if (!resolved.has(url)) n++;
  return n;
}

export type ImageStatus = 'loading' | 'ok' | 'missing';

export function useAssetImage(ref: AssetRef | null, slug: string): { image: HTMLImageElement | null; status: ImageStatus } {
  const url = ref ? assetUrl(ref, slug) : null;
  const initial = url && resolved.has(url) ? resolved.get(url)! : null;
  const [state, setState] = useState<{ url: string | null; image: HTMLImageElement | null; status: ImageStatus }>(() => ({
    url,
    image: initial,
    status: !url ? 'missing' : resolved.has(url) ? (initial ? 'ok' : 'missing') : 'loading',
  }));

  useEffect(() => {
    if (!url) return;
    let alive = true;
    if (!resolved.has(url)) setState({ url, image: null, status: 'loading' });
    loadImage(url).then((img) => {
      if (!img && ref) missingRefs.add(ref);
      if (alive) setState({ url, image: img, status: img ? 'ok' : 'missing' });
    });
    return () => {
      alive = false;
    };
  }, [url, ref]);

  if (state.url !== url) {
    const img = url && resolved.has(url) ? resolved.get(url)! : null;
    return { image: img, status: !url ? 'missing' : resolved.has(url) ? (img ? 'ok' : 'missing') : 'loading' };
  }
  return { image: state.image, status: state.status };
}
