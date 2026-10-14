import type { AssetInfo } from '../../shared/types';

export const ASSET_MIME = 'application/x-storyboard-asset';

/**
 * The asset tile being dragged right now. The drop target reads this first and only falls back
 * to the DataTransfer payload: on Linux (Chrome on Wayland/X11) a custom MIME type can go missing
 * after an OS file drag, which made later tile → scene drops silently do nothing.
 */
let current: AssetInfo | null = null;

export function startAssetDrag(a: AssetInfo, dt: DataTransfer): void {
  current = a;
  dt.setData(ASSET_MIME, JSON.stringify(a));
  dt.effectAllowed = 'copy';
}

export function endAssetDrag(): void {
  current = null;
}

/** true while an asset tile drag is over a drop target */
export function isAssetDrag(dt: DataTransfer | null): boolean {
  return !!current || !!dt?.types.includes(ASSET_MIME);
}

export function draggedAsset(dt: DataTransfer | null): AssetInfo | null {
  if (current) return current;
  const raw = dt?.getData(ASSET_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AssetInfo;
  } catch {
    return null;
  }
}

/** an OS file drag (upload), not one of our tiles */
export function isFileDrag(dt: DataTransfer | null): boolean {
  return !current && !!dt?.types.includes('Files');
}

if (typeof window !== 'undefined') {
  // a drag can end without dragend reaching the tile (tile re-rendered / removed mid-drag)
  window.addEventListener('drop', () => setTimeout(endAssetDrag, 0), true);
  window.addEventListener('dragend', endAssetDrag, true);
}
