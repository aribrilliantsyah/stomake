import { create } from 'zustand';
import { findPanel, findScene, flatScenes } from '../../shared/model';
import type { AssetInfo, Layer, Panel, Project } from '../../shared/types';
import { expandGroups } from '../../shared/multi';
import { api } from '../api';
import { toast } from './uiStore';

/** Events from GET /api/projects/:slug/events (mirrors src/server/live.ts LiveEvent). */
export type LiveEvent =
  | { type: 'hello'; clientId: string; updatedAt?: string | null; agent: { active: boolean; since: string | null } }
  | { type: 'agent'; active: boolean; since: string | null }
  | { type: 'project'; project: Project }
  | { type: 'storyline'; text: string }
  | { type: 'assets' };

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
  /** primary selected layer (last clicked); always a member of selectedLayerIds */
  selectedLayerId: string | null;
  /** all selected layers in the active panel, back → front */
  selectedLayerIds: string[];
  saveStatus: SaveStatus;
  saveError: string | null;
  past: Project[];
  future: Project[];
  /** layer copied with Ctrl+C / Ctrl+X (app-internal clipboard) */
  clipboard: { layers: Layer[]; panelId: string } | null;
  setClipboard(c: { layers: Layer[]; panelId: string } | null): void;
  /** asset copied from the Asset panel (Ctrl+C on a tile); pasting places it in the active panel */
  copiedAsset: AssetInfo | null;
  copyAsset(a: AssetInfo | null): void;
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
  /** click: selects the layer and its whole group; `single` (double-click) selects only that member */
  selectLayer(id: string | null, opts?: { single?: boolean }): void;
  /** Shift/Ctrl+click: add or remove the layer (and its group) */
  toggleLayer(id: string): void;
  /** marquee / Ctrl+A: replace the selection (groups expanded) */
  setSelection(ids: string[]): void;
  flush(): Promise<void>;
  /** an AI agent is editing this project: the editor is read-only */
  agentActive: boolean;
  agentSince: string | null;
  /** SSE client id (for agent-ack) */
  clientId: string | null;
  setClientId(id: string | null): void;
  /** Lock/unlock for an agent. Locking flushes unsaved edits first, then acks the server. */
  setAgent(active: boolean, since: string | null): Promise<void>;
  /** A project version written by the agent: one undo step, already on disk. */
  remoteProject(p: Project): void;
  /** latest storyline pushed by the agent (StorylinePanel listens) */
  remoteStoryline: { text: string; seq: number } | null;
  /** bumped when the server says the asset list changed (Editor refetches) */
  assetsVersion: number;
  onLive(e: LiveEvent): void;
  /** StorylinePanel registers how to save its pending text immediately (flushed before agent-ack). */
  setStorylineFlusher(fn: (() => Promise<void>) | null): void;
  /** Save what can be saved, never throws, never waits while an agent holds the project. */
  settle(): Promise<void>;
}

let lastKey: string | null = null;
let lastAt = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;
let pendingAfterSave = false;
/** updatedAt of the version on disk this editor last saw (sent with saves for the 409 check) */
let baseVersion: string | null = null;
/** live events that arrived before the project finished loading */
let early: LiveEvent[] = [];
let storylineFlusher: (() => Promise<void>) | null = null;

function clearTimer() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

type Sel = Pick<EditorState, 'currentSceneId' | 'activePanelId' | 'selectedLayerId' | 'selectedCover'> & { selectedLayerIds?: string[] };

/** keep only ids still in the panel (in panel order); primary falls back to the front-most selected */
function keepLayers(panel: Panel, s: Sel): { selectedLayerId: string | null; selectedLayerIds: string[] } {
  const want = new Set(s.selectedLayerIds ?? (s.selectedLayerId ? [s.selectedLayerId] : []));
  const ids = panel.layers.filter((l) => want.has(l.id)).map((l) => l.id);
  const primary = s.selectedLayerId && ids.includes(s.selectedLayerId) ? s.selectedLayerId : (ids.at(-1) ?? null);
  return { selectedLayerId: primary, selectedLayerIds: ids };
}

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
    return { selectedCover: true, currentSceneId: s.currentSceneId ?? flatScenes(p)[0].scene.id, activePanelId: panel.id, ...keepLayers(panel, s) };
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
  const keep = panel.id === s.activePanelId ? keepLayers(panel, s) : { selectedLayerId: null, selectedLayerIds: [] };
  return { selectedCover: false, currentSceneId: scene.id, activePanelId: panel.id, ...keep };
}

export const useEditor = create<EditorState>((set, get) => {
  function activeLayers() {
    const { project, activePanelId } = get();
    return (project && activePanelId && findPanel(project, activePanelId)?.panel.layers) || [];
  }
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
      const { updatedAt } = await api.saveProject(slug, { ...sent, updatedAt: baseVersion ?? sent.updatedAt });
      baseVersion = updatedAt;
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
      // while an agent holds the project, retries would only bounce (423); setAgent(false) reschedules
      // 409 = disk moved on (another tab): retrying would loop; the message tells the user to reload
      if (!get().agentActive && (e as { status?: number }).status !== 409) saveTimer = setTimeout(doSave, RETRY_MS);
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
    selectedLayerIds: [],
    saveStatus: 'saved',
    saveError: null,
    past: [],
    future: [],
    clipboard: null,
    agentActive: false,
    agentSince: null,
    clientId: null,
    remoteStoryline: null,
    assetsVersion: 0,
    setClientId(id) {
      set({ clientId: id });
    },

    async setAgent(active, since) {
      if (active) {
        const was = get().agentActive;
        set({ agentActive: true, agentSince: since ?? get().agentSince ?? new Date().toISOString(), selectedLayerId: null, selectedLayerIds: [] });
        if (!was) {
          clearTimer();
          // everything typed so far goes to disk before the agent is allowed to write
          await get()
            .flush()
            .catch(() => toast('warn', 'Edit terakhir belum tersimpan sebelum AI mulai — masih bisa dikembalikan dengan Ctrl+Z setelah AI selesai'));
          await storylineFlusher?.().catch(() => undefined);
        }
        // ack every lock start (also a new lock while we still think the old one is active)
        const { slug, clientId } = get();
        if (slug && clientId) await api.agentAck(slug, clientId).catch(() => undefined);
        return;
      }
      if (!get().agentActive) return;
      set({ agentActive: false, agentSince: null });
      toast('info', 'AI selesai mengedit');
      const st = get().saveStatus;
      if (st === 'dirty' || st === 'error') schedule();
    },

    setStorylineFlusher(fn) {
      storylineFlusher = fn;
    },

    async settle() {
      if (get().agentActive) return;
      await get().flush().catch(() => undefined);
    },

    remoteProject(p) {
      const { project, past } = get();
      lastKey = null;
      clearTimer();
      pendingAfterSave = false;
      baseVersion = p.updatedAt;
      set({
        project: p,
        past: project ? [...past, project].slice(-HISTORY_LIMIT) : past,
        future: [],
        saveStatus: 'saved',
        saveError: null,
        ...fixSelection(p, get(), project),
      });
    },

    onLive(e) {
      if (!get().project) {
        early.push(e);
        return;
      }
      switch (e.type) {
        case 'hello': {
          set({ clientId: e.clientId });
          // missed writes while disconnected? pull the disk version (undoable like an agent edit)
          const slug = get().slug;
          if (slug && e.updatedAt && baseVersion && Date.parse(e.updatedAt) > Date.parse(baseVersion))
            void api.getProject(slug).then((p) => get().slug === slug && get().remoteProject(p), () => undefined);
          if (e.agent.active || get().agentActive) void get().setAgent(e.agent.active, e.agent.since);
          break;
        }
        case 'agent':
          void get().setAgent(e.active, e.since);
          break;
        case 'project':
          get().remoteProject(e.project);
          break;
        case 'storyline':
          set({ remoteStoryline: { text: e.text, seq: (get().remoteStoryline?.seq ?? 0) + 1 } });
          break;
        case 'assets':
          set({ assetsVersion: get().assetsVersion + 1 });
          break;
      }
    },
    setClipboard(c) {
      set({ clipboard: c, copiedAsset: null });
    },
    copiedAsset: null,
    copyAsset(a) {
      set({ copiedAsset: a, clipboard: a ? null : get().clipboard });
    },

    reset() {
      clearTimer();
      lastKey = null;
      saving = null;
      pendingAfterSave = false;
      baseVersion = null;
      early = [];
      set({ slug: null, project: null, past: [], future: [], saveStatus: 'saved', saveError: null, currentSceneId: null, selectedCover: false, activePanelId: null, selectedLayerId: null, selectedLayerIds: [], agentActive: false, agentSince: null, clientId: null, remoteStoryline: null, assetsVersion: 0 });
    },

    async load(slug) {
      if (get().slug) await get().flush().catch(() => undefined);
      get().reset();
      const project = await api.getProject(slug);
      baseVersion = project.updatedAt;
      set({ slug, project, ...fixSelection(project, { currentSceneId: null, selectedCover: false, activePanelId: null, selectedLayerId: null }) });
      const queued = early;
      early = [];
      for (const e of queued) get().onLive(e);
    },

    apply(fn, opts) {
      const { project, past } = get();
      if (!project || get().agentActive) return;
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
      if (!project || past.length === 0 || get().agentActive) return;
      lastKey = null;
      commit(past[past.length - 1], past.slice(0, -1), [project, ...future]);
    },

    redo() {
      const { project, past, future } = get();
      if (!project || future.length === 0 || get().agentActive) return;
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
      set({ activePanelId: id, selectedLayerId: null, selectedLayerIds: [] });
    },

    selectLayer(id, opts) {
      if (!id) return set({ selectedLayerId: null, selectedLayerIds: [] });
      const layers = activeLayers();
      const ids = opts?.single ? [id] : expandGroups(layers, [id]);
      set({ selectedLayerId: id, selectedLayerIds: ids });
    },

    toggleLayer(id) {
      const layers = activeLayers();
      const group = expandGroups(layers, [id]);
      const cur = get().selectedLayerIds;
      const on = cur.includes(id);
      const want = new Set(on ? cur.filter((x) => !group.includes(x)) : [...cur, ...group]);
      const ids = layers.filter((l) => want.has(l.id)).map((l) => l.id);
      const primary = on ? (ids.includes(get().selectedLayerId ?? '') ? get().selectedLayerId : (ids.at(-1) ?? null)) : id;
      set({ selectedLayerIds: ids, selectedLayerId: primary });
    },

    setSelection(ids) {
      const layers = activeLayers();
      const all = expandGroups(layers, ids);
      set({ selectedLayerIds: all, selectedLayerId: all.at(-1) ?? null });
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
