import { newId } from './ids';
import type { AssetInfo, ImageLayer, Layer, Page, Panel, Project, Scene } from './types';

export const DEFAULT_PAGE_BG = { kind: 'color', color: '#D4BFB3' } as const;
export const DEFAULT_PANEL_BG = { kind: 'color', color: '#FFFFFF' } as const;
export const MAX_SCENES_PER_PAGE = 3;

function emptyPanel(): Panel {
  return { id: newId(), background: { ...DEFAULT_PANEL_BG }, layers: [] };
}

function emptyScene(): Scene {
  return { id: newId(), note: '', subtitle: '', split: false, panels: [emptyPanel()] };
}

function emptyPage(scenes: Scene[] = [emptyScene()]): Page {
  return { id: newId(), background: null, scenes };
}

export function createProject(name: string, now: string): Project {
  return {
    version: 1,
    name,
    createdAt: now,
    updatedAt: now,
    pageBackground: { ...DEFAULT_PAGE_BG },
    pages: [emptyPage()],
  };
}

export function flatScenes(p: Project): { scene: Scene; pageIndex: number; number: number }[] {
  const out: { scene: Scene; pageIndex: number; number: number }[] = [];
  p.pages.forEach((page, pageIndex) =>
    page.scenes.forEach((scene) => out.push({ scene, pageIndex, number: out.length + 1 })),
  );
  return out;
}

export function sceneNumber(p: Project, sceneId: string): number {
  const f = flatScenes(p).find((s) => s.scene.id === sceneId);
  if (!f) throw new Error(`scene ${sceneId} not found`);
  return f.number;
}

function locate(p: Project, sceneId: string): { pi: number; si: number } | null {
  for (let pi = 0; pi < p.pages.length; pi++) {
    const si = p.pages[pi].scenes.findIndex((s) => s.id === sceneId);
    if (si >= 0) return { pi, si };
  }
  return null;
}

/**
 * Overflow of page `pi` (more than 3 scenes) moves to a new page inserted right after it.
 * Empty pages are dropped; an empty project keeps one page with one empty scene.
 */
function normalize(pages: Page[], pi: number | null): Page[] {
  let out = pages.slice();
  if (pi !== null && out[pi] && out[pi].scenes.length > MAX_SCENES_PER_PAGE) {
    const page = out[pi];
    const keep = page.scenes.slice(0, MAX_SCENES_PER_PAGE);
    const overflow = page.scenes.slice(MAX_SCENES_PER_PAGE);
    out.splice(pi, 1, { ...page, scenes: keep }, emptyPage(overflow));
  }
  out = out.filter((pg) => pg.scenes.length > 0);
  if (out.length === 0) out = [emptyPage()];
  return out;
}

function withPages(p: Project, pages: Page[]): Project {
  return { ...p, pages };
}

function insertAt(p: Project, pi: number, si: number, scene: Scene): Project {
  const pages = p.pages.slice();
  const scenes = pages[pi].scenes.slice();
  scenes.splice(si, 0, scene);
  pages[pi] = { ...pages[pi], scenes };
  return withPages(p, normalize(pages, pi));
}

export function addSceneAfter(p: Project, sceneId: string): { project: Project; sceneId: string } {
  const loc = locate(p, sceneId);
  if (!loc) throw new Error(`scene ${sceneId} not found`);
  const scene = emptyScene();
  return { project: insertAt(p, loc.pi, loc.si + 1, scene), sceneId: scene.id };
}

function cloneLayer(l: Layer): Layer {
  return { ...structuredClone(l), id: newId() };
}

function clonePanel(pn: Panel): Panel {
  return { id: newId(), background: structuredClone(pn.background), layers: pn.layers.map(cloneLayer) };
}

export function duplicateScene(p: Project, sceneId: string): { project: Project; sceneId: string } {
  const loc = locate(p, sceneId);
  if (!loc) throw new Error(`scene ${sceneId} not found`);
  const src = p.pages[loc.pi].scenes[loc.si];
  const copy: Scene = { ...src, id: newId(), panels: src.panels.map(clonePanel) };
  return { project: insertAt(p, loc.pi, loc.si + 1, copy), sceneId: copy.id };
}

export function removeScene(p: Project, sceneId: string): Project {
  const loc = locate(p, sceneId);
  if (!loc) return p;
  const pages = p.pages.slice();
  pages[loc.pi] = { ...pages[loc.pi], scenes: pages[loc.pi].scenes.filter((s) => s.id !== sceneId) };
  return withPages(p, normalize(pages, null));
}

/** Swap with neighbouring scene in flat order; page sizes are preserved. */
export function moveScene(p: Project, sceneId: string, dir: -1 | 1): Project {
  const flat = flatScenes(p);
  const i = flat.findIndex((s) => s.scene.id === sceneId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= flat.length) return p;
  const order = flat.map((s) => s.scene);
  [order[i], order[j]] = [order[j], order[i]];
  let k = 0;
  return withPages(
    p,
    p.pages.map((pg) => ({ ...pg, scenes: pg.scenes.map(() => order[k++]) })),
  );
}

function mapScene(p: Project, sceneId: string, fn: (s: Scene) => Scene): Project {
  return withPages(
    p,
    p.pages.map((pg) =>
      pg.scenes.some((s) => s.id === sceneId)
        ? { ...pg, scenes: pg.scenes.map((s) => (s.id === sceneId ? fn(s) : s)) }
        : pg,
    ),
  );
}

export function setSplit(p: Project, sceneId: string, split: boolean): Project {
  return mapScene(p, sceneId, (s) => {
    if (s.split === split) return s;
    return split
      ? { ...s, split, panels: [s.panels[0], clonePanel(s.panels[0])] }
      : { ...s, split, panels: [s.panels[0]] };
  });
}

export function updateScene(
  p: Project,
  sceneId: string,
  patch: Partial<Pick<Scene, 'note' | 'subtitle'>>,
): Project {
  return mapScene(p, sceneId, (s) => ({ ...s, ...patch }));
}

export function findPanel(p: Project, panelId: string): { panel: Panel; scene: Scene } | null {
  for (const pg of p.pages)
    for (const scene of pg.scenes) {
      const panel = scene.panels.find((pn) => pn.id === panelId);
      if (panel) return { panel, scene };
    }
  return null;
}

export function updatePanel(p: Project, panelId: string, fn: (panel: Panel) => Panel): Project {
  const found = findPanel(p, panelId);
  if (!found) return p;
  return mapScene(p, found.scene.id, (s) => ({
    ...s,
    panels: s.panels.map((pn) => (pn.id === panelId ? fn(pn) : pn)),
  }));
}

export function findScene(p: Project, sceneId: string): Scene | null {
  const loc = locate(p, sceneId);
  return loc ? p.pages[loc.pi].scenes[loc.si] : null;
}

export function pageIndexOfScene(p: Project, sceneId: string): number {
  return locate(p, sceneId)?.pi ?? -1;
}
