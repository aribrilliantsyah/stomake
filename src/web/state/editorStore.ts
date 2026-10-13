import { create } from 'zustand';
import { findScene, flatScenes } from '../../shared/model';
import type { Layer, Project } from '../../shared/types';
import { api } from '../api';

export const HISTORY_LIMIT = 100;
export const COALESCE_MS = 500;
export const AUTOSAVE_MS = 1500;
export const RETRY_MS = 5000;

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';

interface EditorState {
  slug: string | null;
  project: Project | null;
  currentSceneId: string | null;
  /** cover page selected (currentSceneId keeps the last scene) */
  selectedCover: boolean;
  activePanelId: string | null;
  selectedLayerId: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  past: Project[];
  future: Project[];
  /** layer copied with Ctrl+C / Ctrl+X (app-internal clipboard) */
  clipboard: { layer: Layer; panelId: string } | null;
  setClipboard(c: { layer: Layer; panelId: string } | null): void;
  reset(): void;
  load(slug: string): Promise<void>;
  apply(fn: (p: Project) => Project, opts?: { coalesceKey?: string }): void;
  undo(): void;
  redo(): void;
  selectScene(id: string): void;
  selectCover(): void;
  /** index of the page being edited, -1 for the cover */
  currentPageIndex(): number;
  setActivePanel(id: string): void;
  selectLayer(id: string | null): void;
  flush(): Promise<void>;
}

let lastKey: string | null = null;
let lastAt = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;
let pendingAfterSave = false;

function clearTimer() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

type Sel = Pick<EditorState, 'currentSceneId' | 'activePanelId' | 'selectedLayerId' | 'selectedCover'>;

function locateScene(p: Project, id: string | null): { pi: number; si: number } | null {
  if (!id) return null;
  for (let pi = 0; pi < p.pages.length; pi++) {
    const si = p.pages[pi].scenes.findIndex((s) => s.id === id);
    if (si >= 0) return { pi, si };
  }
  return null;
}

/**
 * Keep selection valid after the project changed (undo, delete, ...).
 * `prev` is the project before the change, used to find a neighbour of a removed scene.
 */
function fixSelection(p: Project, s: Sel, prev?: Project | null) {
  if (s.selectedCover && p.cover) {
    const panel = p.cover.panel;
    const layer = panel.layers.some((l) => l.id === s.selectedLayerId) ? s.selectedLayerId : null;
    return { selectedCover: true, currentSceneId: s.currentSceneId ?? flatScenes(p)[0].scene.id, activePanelId: panel.id, selectedLayerId: layer };
  }
  let scene = s.currentSceneId ? findScene(p, s.currentSceneId) : null;
  if (!scene && prev) {
    const old = locateScene(prev, s.currentSceneId);
    if (old) {
      // same page still there? pick the scene at the same slot; otherwise previous page, else next page
      const oldPageId = prev.pages[old.pi].id;
      const samePage = p.pages.find((pg) => pg.id === oldPageId);
      if (samePage) scene = samePage.scenes[Math.min(old.si, samePage.scenes.length - 1)];
      else {
        const before = prev.pages.slice(0, old.pi).reverse().map((pg) => p.pages.find((x) => x.id === pg.id)).find(Boolean);
        const after = prev.pages.slice(old.pi + 1).map((pg) => p.pages.find((x) => x.id === pg.id)).find(Boolean);
        scene = (before ?? after)?.scenes[0] ?? null;
      }
    }
  }
  scene ??= flatScenes(p)[0].scene;
  const panel = scene.panels.find((pn) => pn.id === s.activePanelId) ?? scene.panels[0];
  const layer = panel.layers.some((l) => l.id === s.selectedLayerId) ? s.selectedLayerId : null;
  return { selectedCover: false, currentSceneId: scene.id, activePanelId: panel.id, selectedLayerId: layer };
}

export const useEditor = create<EditorState>((set, get) => {
  async function doSave() {
    const { slug, project } = get();
    if (!slug || !project) return;
    if (saving) {
      pendingAfterSave = true;
      return saving;
    }
    let done!: () => void;
    saving = new Promise<void>((r) => (done = r));
    set({ saveStatus: 'saving' });
    const sent = project;
    try {
      const { updatedAt } = await api.saveProject(slug, sent);
      const cur = get().project;
      const stamp = (p: Project) => ({ ...p, updatedAt });
      set({
        project: cur ? stamp(cur) : cur,
        past: get().past.map(stamp),
        future: get().future.map(stamp),
        saveStatus: cur === sent ? 'saved' : 'dirty',
        saveError: null,
      });
    } catch (e) {
      set({ saveStatus: 'error', saveError: (e as Error).message });
      clearTimer();
      saveTimer = setTimeout(doSave, RETRY_MS);
    } finally {
      saving = null;
      done();
    }
    if (pendingAfterSave || get().saveStatus === 'dirty') {
      pendingAfterSave = false;
      if (get().saveStatus !== 'error') schedule();
    }
  }

  function schedule() {
    clearTimer();
    saveTimer = setTimeout(doSave, AUTOSAVE_MS);
  }

  function commit(next: Project, past: Project[], future: Project[]) {
    set({ project: next, past, future, saveStatus: 'dirty', ...fixSelection(next, get(), get().project) });
    schedule();
  }

  return {
    slug: null,
    project: null,
    currentSceneId: null,
    selectedCover: false,
    activePanelId: null,
    selectedLayerId: null,
    saveStatus: 'saved',
    saveError: null,
    past: [],
    future: [],
    clipboard: null,
    setClipboard(c) {
      set({ clipboard: c });
    },

    reset() {
      clearTimer();
      lastKey = null;
      saving = null;
      pendingAfterSave = false;
      set({ slug: null, project: null, past: [], future: [], saveStatus: 'saved', saveError: null, currentSceneId: null, selectedCover: false, activePanelId: null, selectedLayerId: null });
    },

    async load(slug) {
      if (get().slug) await get().flush().catch(() => undefined);
      get().reset();
      const project = await api.getProject(slug);
      set({ slug, project, ...fixSelection(project, { currentSceneId: null, selectedCover: false, activePanelId: null, selectedLayerId: null }) });
    },

    apply(fn, opts) {
      const { project, past } = get();
      if (!project) return;
      const next = fn(project);
      if (next === project) return;
      const now = Date.now();
      const key = opts?.coalesceKey ?? null;
      const coalesce = key !== null && key === lastKey && now - lastAt < COALESCE_MS;
      lastKey = key;
      lastAt = now;
      const newPast = coalesce ? past : [...past, project].slice(-HISTORY_LIMIT);
      commit(next, newPast, []);
    },

    undo() {
      const { project, past, future } = get();
      if (!project || past.length === 0) return;
      lastKey = null;
      commit(past[past.length - 1], past.slice(0, -1), [project, ...future]);
    },

    redo() {
      const { project, past, future } = get();
      if (!project || future.length === 0) return;
      lastKey = null;
      commit(future[0], [...past, project].slice(-HISTORY_LIMIT), future.slice(1));
    },

    selectScene(id) {
      const p = get().project;
      if (!p) return;
      set(fixSelection(p, { currentSceneId: id, selectedCover: false, activePanelId: null, selectedLayerId: null }));
    },

    selectCover() {
      const p = get().project;
      if (!p?.cover) return;
      set(fixSelection(p, { currentSceneId: get().currentSceneId, selectedCover: true, activePanelId: null, selectedLayerId: null }));
    },

    currentPageIndex() {
      const { project, selectedCover, currentSceneId } = get();
      if (!project) return 0;
      if (selectedCover) return -1;
      return Math.max(0, locateScene(project, currentSceneId)?.pi ?? 0);
    },

    setActivePanel(id) {
      set({ activePanelId: id, selectedLayerId: null });
    },

    selectLayer(id) {
      set({ selectedLayerId: id });
    },

    /** Resolves once everything currently in memory is on disk (or a save failed). */
    async flush() {
      for (let i = 0; i < 20; i++) {
        if (saving) {
          await saving;
          continue;
        }
        const st = get().saveStatus;
        if (st === 'saved') return;
        clearTimer();
        await doSave();
        if (get().saveStatus === 'error') throw new Error(get().saveError ?? 'save failed');
      }
    },
  };
});
