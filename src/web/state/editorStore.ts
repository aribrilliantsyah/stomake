import { create } from 'zustand';
import { findScene, flatScenes } from '../../shared/model';
import type { Project } from '../../shared/types';
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
  activePanelId: string | null;
  selectedLayerId: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  past: Project[];
  future: Project[];
  reset(): void;
  load(slug: string): Promise<void>;
  apply(fn: (p: Project) => Project, opts?: { coalesceKey?: string }): void;
  undo(): void;
  redo(): void;
  selectScene(id: string): void;
  setActivePanel(id: string): void;
  selectLayer(id: string | null): void;
  flush(): Promise<void>;
}

let lastKey: string | null = null;
let lastAt = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let pendingAfterSave = false;

function clearTimer() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

/** Keep selection valid after the project changed (undo, delete, ...). */
function fixSelection(p: Project, s: Pick<EditorState, 'currentSceneId' | 'activePanelId' | 'selectedLayerId'>) {
  const scene = (s.currentSceneId && findScene(p, s.currentSceneId)) || flatScenes(p)[0].scene;
  const panel = scene.panels.find((pn) => pn.id === s.activePanelId) ?? scene.panels[0];
  const layer = panel.layers.some((l) => l.id === s.selectedLayerId) ? s.selectedLayerId : null;
  return { currentSceneId: scene.id, activePanelId: panel.id, selectedLayerId: layer };
}

export const useEditor = create<EditorState>((set, get) => {
  async function doSave() {
    const { slug, project } = get();
    if (!slug || !project) return;
    if (saving) {
      pendingAfterSave = true;
      return;
    }
    saving = true;
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
      saving = false;
    }
    if (pendingAfterSave || get().saveStatus === 'dirty') {
      pendingAfterSave = false;
      schedule();
    }
  }

  function schedule() {
    clearTimer();
    saveTimer = setTimeout(doSave, AUTOSAVE_MS);
  }

  function commit(next: Project, past: Project[], future: Project[]) {
    set({ project: next, past, future, saveStatus: 'dirty', ...fixSelection(next, get()) });
    schedule();
  }

  return {
    slug: null,
    project: null,
    currentSceneId: null,
    activePanelId: null,
    selectedLayerId: null,
    saveStatus: 'saved',
    saveError: null,
    past: [],
    future: [],

    reset() {
      clearTimer();
      lastKey = null;
      saving = false;
      pendingAfterSave = false;
      set({ slug: null, project: null, past: [], future: [], saveStatus: 'saved', saveError: null, currentSceneId: null, activePanelId: null, selectedLayerId: null });
    },

    async load(slug) {
      get().reset();
      const project = await api.getProject(slug);
      set({ slug, project, ...fixSelection(project, { currentSceneId: null, activePanelId: null, selectedLayerId: null }) });
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
      set(fixSelection(p, { currentSceneId: id, activePanelId: null, selectedLayerId: null }));
    },

    setActivePanel(id) {
      set({ activePanelId: id, selectedLayerId: null });
    },

    selectLayer(id) {
      set({ selectedLayerId: id });
    },

    async flush() {
      if (get().saveStatus === 'dirty' || get().saveStatus === 'error') {
        clearTimer();
        await doSave();
      }
    },
  };
});
