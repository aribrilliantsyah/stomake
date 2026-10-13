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

  toasts: [],
  toast(kind, text, link) {
    const id = `t${++seq}`;
    let toasts = [...get().toasts, { id, kind, text, link }];
    while (toasts.length > MAX_TOASTS) {
      const [old, ...rest] = toasts;
      clearTimeout(timers.get(old.id));
      timers.delete(old.id);
      toasts = rest;
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
