import { create } from 'zustand';

export type PanelName = 'slides' | 'library' | 'props';
export type Panels = Record<PanelName, boolean>;
export type ToastKind = 'ok' | 'info' | 'warn' | 'err';

export interface Toast {
  id: string;
  kind: ToastKind;
  text: string;
  link?: { href: string; label: string };
}

export const PANELS_KEY = 'sb.panels';
export const TOAST_MS: Record<ToastKind, number | null> = { ok: 4000, info: 4000, warn: 8000, err: null };
export const MAX_TOASTS = 4;

/** Page zoom presets in %, like Word's zoom steps. */
export const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400] as const;
export const ZOOM_MIN = 25;
export const ZOOM_MAX = 400;
export type PageZoom = number | 'fit';

/** Next preset above (dir 1) or below (dir -1) the current percent. */
export function nextZoom(current: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > current + 0.5) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.5) ?? ZOOM_MIN;
}

const DEFAULT_PANELS: Panels = { slides: true, library: true, props: true };

function readPanels(): Panels {
  try {
    const raw = JSON.parse(localStorage.getItem(PANELS_KEY) ?? 'null');
    if (raw && typeof raw === 'object') return { ...DEFAULT_PANELS, ...pickBools(raw) };
  } catch {
    /* corrupt → default */
  }
  return { ...DEFAULT_PANELS };
}

function pickBools(raw: Record<string, unknown>): Partial<Panels> {
  const out: Partial<Panels> = {};
  for (const k of Object.keys(DEFAULT_PANELS) as PanelName[]) if (typeof raw[k] === 'boolean') out[k] = raw[k] as boolean;
  return out;
}

interface UiState {
  panels: Panels;
  togglePanel(name: PanelName): void;
  zoom: boolean;
  setZoom(on: boolean): void;
  /** page view zoom; 'fit' = fit page to the center area */
  pageZoom: PageZoom;
  setPageZoom(z: PageZoom): void;
  toasts: Toast[];
  toast(kind: ToastKind, text: string, link?: Toast['link']): string;
  dismissToast(id: string): void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let seq = 0;

export const useUi = create<UiState>((set, get) => ({
  panels: typeof localStorage === 'undefined' ? { ...DEFAULT_PANELS } : readPanels(),
  togglePanel(name) {
    const panels = { ...get().panels, [name]: !get().panels[name] };
    set({ panels });
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(panels));
    } catch {
      /* storage full / disabled */
    }
  },

  zoom: false,
  setZoom(on) {
    set({ zoom: on });
  },

  pageZoom: 'fit',
  setPageZoom(z) {
    set({ pageZoom: z === 'fit' ? 'fit' : Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))) });
  },

  toasts: [],
  toast(kind, text, link) {
    const id = `t${++seq}`;
    let toasts = [...get().toasts, { id, kind, text, link }];
    while (toasts.length > MAX_TOASTS) {
      // evict the oldest non-error toast first; errors only go when everything is an error
      const idx = toasts.findIndex((t) => t.kind !== 'err');
      const old = toasts[idx >= 0 ? idx : 0];
      clearTimeout(timers.get(old.id));
      timers.delete(old.id);
      toasts = toasts.filter((t) => t.id !== old.id);
    }
    set({ toasts });
    const ms = TOAST_MS[kind];
    if (ms !== null) timers.set(id, setTimeout(() => get().dismissToast(id), ms));
    return id;
  },
  dismissToast(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** Shorthand for non-React callers. */
export const toast = (kind: ToastKind, text: string, link?: Toast['link']) => useUi.getState().toast(kind, text, link);
