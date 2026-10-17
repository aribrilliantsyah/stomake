import { newId } from './ids';
import type { AssetRef, Cover, ShapeKind, ShapeLayer, ArrowLayer, AssetInfo, Background, EmojiLayer, ImageLayer, Layer, Page, Panel, Project, Scene, TextLayer } from './types';

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
    version: 2,
    name,
    createdAt: now,
    updatedAt: now,
    pageBackground: { ...DEFAULT_PAGE_BG },
    cover: null,
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

function withPages(p: Project, pages: Page[]): Project {
  return { ...p, pages };
}

function cloneLayer(l: Layer): Layer {
  return { ...structuredClone(l), id: newId() };
}

function clonePanel(pn: Panel): Panel {
  return { id: newId(), background: structuredClone(pn.background), layers: pn.layers.map(cloneLayer) };
}

function cloneScene(s: Scene): Scene {
  return { ...s, id: newId(), panels: s.panels.map(clonePanel) };
}

function pageIndex(p: Project, pageId: string): number {
  return p.pages.findIndex((pg) => pg.id === pageId);
}

function setPageScenes(p: Project, pi: number, scenes: Scene[]): Project {
  return withPages(p, p.pages.map((pg, i) => (i === pi ? { ...pg, scenes } : pg)));
}

export function pageOf(p: Project, sceneId: string): Page | null {
  const loc = locate(p, sceneId);
  return loc ? p.pages[loc.pi] : null;
}

/** Test/demo helper: replace pages with fresh pages of the given scene counts (each 1..3). */
export function withPageSizes(p: Project, sizes: number[]): Project {
  return withPages(p, sizes.map((n) => emptyPage(Array.from({ length: Math.max(1, Math.min(3, n)) }, emptyScene))));
}

/** Add an empty scene into a page (after `afterSceneId`, or at the end). Null when the page already has 3. */
export function addSceneInPage(p: Project, pageId: string, afterSceneId: string | null): { project: Project; sceneId: string } | null {
  const pi = pageIndex(p, pageId);
  if (pi < 0 || p.pages[pi].scenes.length >= MAX_SCENES_PER_PAGE) return null;
  const scenes = p.pages[pi].scenes.slice();
  const at = afterSceneId ? scenes.findIndex((s) => s.id === afterSceneId) + 1 : scenes.length;
  const scene = emptyScene();
  scenes.splice(at <= 0 ? scenes.length : at, 0, scene);
  return { project: setPageScenes(p, pi, scenes), sceneId: scene.id };
}

/** Insert a new page (1 empty scene) after `afterPageId`, or at the start when null. */
export function addPage(p: Project, afterPageId: string | null): { project: Project; pageId: string; sceneId: string } {
  const page = emptyPage();
  const at = afterPageId ? pageIndex(p, afterPageId) + 1 : 0;
  const pages = p.pages.slice();
  pages.splice(at <= 0 && afterPageId ? pages.length : at, 0, page);
  return { project: withPages(p, pages), pageId: page.id, sceneId: page.scenes[0].id };
}

export function duplicatePage(p: Project, pageId: string): { project: Project; pageId: string } {
  const pi = pageIndex(p, pageId);
  if (pi < 0) return { project: p, pageId };
  const src = p.pages[pi];
  const copy: Page = { id: newId(), background: structuredClone(src.background), scenes: src.scenes.map(cloneScene) };
  const pages = p.pages.slice();
  pages.splice(pi + 1, 0, copy);
  return { project: withPages(p, pages), pageId: copy.id };
}

export function removePage(p: Project, pageId: string): Project {
  if (p.pages.length <= 1 || pageIndex(p, pageId) < 0) return p;
  return withPages(p, p.pages.filter((pg) => pg.id !== pageId));
}

export function movePage(p: Project, pageId: string, dir: -1 | 1): Project {
  const i = pageIndex(p, pageId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.pages.length) return p;
  const pages = p.pages.slice();
  [pages[i], pages[j]] = [pages[j], pages[i]];
  return withPages(p, pages);
}

export function duplicateScene(p: Project, sceneId: string): { project: Project; sceneId: string } {
  const loc = locate(p, sceneId);
  if (!loc || p.pages[loc.pi].scenes.length >= MAX_SCENES_PER_PAGE) return { project: p, sceneId };
  const scenes = p.pages[loc.pi].scenes.slice();
  const copy = cloneScene(scenes[loc.si]);
  scenes.splice(loc.si + 1, 0, copy);
  return { project: setPageScenes(p, loc.pi, scenes), sceneId: copy.id };
}

export function canRemoveScene(p: Project, sceneId: string): boolean {
  const pg = pageOf(p, sceneId);
  return !!pg && pg.scenes.length > 1;
}

export function removeScene(p: Project, sceneId: string): Project {
  const loc = locate(p, sceneId);
  if (!loc || !canRemoveScene(p, sceneId)) return p;
  return setPageScenes(p, loc.pi, p.pages[loc.pi].scenes.filter((s) => s.id !== sceneId));
}

/** Move a scene left/right within its page. */
export function moveScene(p: Project, sceneId: string, dir: -1 | 1): Project {
  const loc = locate(p, sceneId);
  if (!loc) return p;
  const scenes = p.pages[loc.pi].scenes.slice();
  const j = loc.si + dir;
  if (j < 0 || j >= scenes.length) return p;
  [scenes[loc.si], scenes[j]] = [scenes[j], scenes[loc.si]];
  return setPageScenes(p, loc.pi, scenes);
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

export function findPanel(p: Project, panelId: string): { panel: Panel; scene: Scene | null } | null {
  if (p.cover && p.cover.panel.id === panelId) return { panel: p.cover.panel, scene: null };
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
  if (!found.scene) return { ...p, cover: { ...p.cover!, panel: fn(p.cover!.panel) } };
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


// ---- layers ----

type Space = { w: number; h: number };

export function layerFromDrop(info: AssetInfo, dropX: number, dropY: number, space: Space): ImageLayer {
  const width = Math.round(space.w * 0.6);
  const height = Math.round((width * info.height) / Math.max(1, info.width));
  return { id: newId(), type: 'image', ref: info.ref, x: dropX, y: dropY, width, height, rotation: 0, opacity: 1, flipX: false, flipY: false };
}

export function defaultText(space: Space): TextLayer {
  return { id: newId(), type: 'text', text: 'TEKS', font: 'Bangers', fontSize: 120, fill: '#000000', stroke: '#FFFFFF', strokeWidth: 8, x: space.w / 2, y: space.h / 2, rotation: 0, opacity: 1 };
}

export function defaultArrow(space: Space): ArrowLayer {
  return { id: newId(), type: 'arrow', points: [0, 0, 0, -300], strokeWidth: 18, color: '#000000', x: space.w / 2, y: space.h / 2, rotation: 0, opacity: 1 };
}

export function defaultEmoji(char: string, space: Space): EmojiLayer {
  return { id: newId(), type: 'emoji', char, size: 200, x: space.w / 2, y: space.h / 2, rotation: 0, opacity: 1 };
}

export function addLayer(p: Project, panelId: string, layer: Layer): Project {
  return updatePanel(p, panelId, (pn) => ({ ...pn, layers: [...pn.layers, layer] }));
}

export function updateLayer(p: Project, panelId: string, layerId: string, patch: Partial<Layer>): Project {
  return updatePanel(p, panelId, (pn) => ({
    ...pn,
    layers: pn.layers.map((l) => (l.id === layerId ? ({ ...l, ...patch } as Layer) : l)),
  }));
}

export function removeLayer(p: Project, panelId: string, layerId: string): Project {
  return updatePanel(p, panelId, (pn) => ({ ...pn, layers: pn.layers.filter((l) => l.id !== layerId) }));
}

export function reorderLayer(p: Project, panelId: string, layerId: string, dir: 'up' | 'down' | 'top' | 'bottom'): Project {
  const found = findPanel(p, panelId);
  if (!found) return p;
  const layers = found.panel.layers.slice();
  const i = layers.findIndex((l) => l.id === layerId);
  if (i < 0) return p;
  const j = dir === 'up' ? i + 1 : dir === 'down' ? i - 1 : dir === 'top' ? layers.length - 1 : 0;
  if (j < 0 || j >= layers.length || j === i) return p;
  const [l] = layers.splice(i, 1);
  layers.splice(j, 0, l);
  return updatePanel(p, panelId, (pn) => ({ ...pn, layers }));
}

export function setPageBackground(p: Project, pageIndex: number, bg: Background | null): Project {
  return { ...p, pages: p.pages.map((pg, i) => (i === pageIndex ? { ...pg, background: bg } : pg)) };
}

// ---- cover ----

export function addCover(p: Project): Project {
  if (p.cover) return p;
  return { ...p, cover: { id: newId(), title: 'VISUAL ASLI', panel: emptyPanel() } };
}

export function removeCover(p: Project): Project {
  return p.cover ? { ...p, cover: null } : p;
}

export function updateCover(p: Project, patch: Partial<Pick<Cover, 'title'>>): Project {
  return p.cover ? { ...p, cover: { ...p.cover, ...patch } } : p;
}

// ---- shapes ----

const LINE_KINDS: readonly ShapeKind[] = ['line', 'arrow', 'doubleArrow'];

export function isRotate(kind: ShapeKind): boolean {
  return kind === 'rotateCw' || kind === 'rotateCcw';
}

export function isLineShape(kind: ShapeKind): boolean {
  return LINE_KINDS.includes(kind);
}

export function defaultShape(kind: ShapeKind, space: { w: number; h: number }): ShapeLayer {
  const line = isLineShape(kind);
  return {
    id: newId(),
    type: 'shape',
    shape: kind,
    x: space.w / 2,
    y: space.h / 2,
    rotation: 0,
    opacity: 1,
    width: line ? 500 : 400,
    height: line ? 0 : 400,
    fill: kind === 'bubble' ? '#FFFFFF' : null,
    stroke: kind === 'target' || isRotate(kind) ? '#E53935' : '#000000',
    strokeWidth: isRotate(kind) ? 14 : 12,
    dash: false,
  };
}

export const MIN_SHAPE = 8;

/**
 * New box after a Transformer scale. A negative scale (handle dragged past the opposite edge)
 * keeps its magnitude; non-line shapes never go below MIN_SHAPE; a line's height stays 0.
 */
export function resizeShape(l: ShapeLayer, sx: number, sy: number): Pick<ShapeLayer, 'width' | 'height'> {
  const f = (v: number, s: number, min: number) => {
    const n = Math.round(v * Math.abs(s));
    return Number.isFinite(n) ? Math.max(min, n) : min;
  };
  const line = isLineShape(l.shape);
  return { width: f(l.width, sx, MIN_SHAPE), height: line ? 0 : f(l.height, sy, MIN_SHAPE) };
}

/** Invisible box around a line shape so the Transformer has a non-zero height to work with. */
export function lineHitBox(l: ShapeLayer): { x: number; y: number; width: number; height: number } {
  const height = Math.max(40, l.strokeWidth * 3);
  return { x: -l.width / 2, y: -height / 2, width: l.width, height };
}

// ---- clipboard ----

/** Paste a copy of `layer` into a panel; offset +40,+40 when pasting back into the source panel. */
export function pasteLayer(p: Project, panelId: string, layer: Layer, sameSource: boolean): { project: Project; layerId: string } {
  const copy = { ...structuredClone(layer), id: newId() } as Layer;
  if (sameSource) {
    copy.x += 40;
    copy.y += 40;
  }
  return { project: addLayer(p, panelId, copy), layerId: copy.id };
}

/** `paste-YYYYMMDD-HHMMSS.png`, local time. */
export function pasteFileName(now: Date): string {
  const z = (n: number) => String(n).padStart(2, '0');
  return `paste-${now.getFullYear()}${z(now.getMonth() + 1)}${z(now.getDate())}-${z(now.getHours())}${z(now.getMinutes())}${z(now.getSeconds())}.png`;
}

/** Set layer transparency from a 0–100 percent value (clamped); NaN is ignored. */
export function setLayerOpacity(p: Project, panelId: string, layerId: string, percent: number): Project {
  if (!Number.isFinite(percent)) return p;
  const v = Math.round(Math.max(0, Math.min(100, percent))) / 100;
  return updateLayer(p, panelId, layerId, { opacity: v });
}

/** Point every image layer and background using `from` at `to` (e.g. a pasted clip saved to the library). */
export function replaceRef(p: Project, from: AssetRef, to: AssetRef): Project {
  const bg = (b: Background): Background => (b.kind === 'asset' && b.ref === from ? { ...b, ref: to } : b);
  const panel = (pn: Panel): Panel => ({
    ...pn,
    background: bg(pn.background),
    layers: pn.layers.map((l) => (l.type === 'image' && l.ref === from ? { ...l, ref: to } : l)),
  });
  return {
    ...p,
    pageBackground: bg(p.pageBackground),
    cover: p.cover ? { ...p.cover, panel: panel(p.cover.panel) } : null,
    pages: p.pages.map((pg) => ({ ...pg, background: pg.background ? bg(pg.background) : null, scenes: pg.scenes.map((s) => ({ ...s, panels: s.panels.map(panel) })) })),
  };
}

/** Every asset ref used by a project (layers and backgrounds), unique. */
export function assetRefs(p: Project): AssetRef[] {
  const out = new Set<AssetRef>();
  const bg = (b: Background | null) => b?.kind === 'asset' && out.add(b.ref);
  const panels = [...(p.cover ? [p.cover.panel] : []), ...p.pages.flatMap((pg) => pg.scenes.flatMap((s) => s.panels))];
  bg(p.pageBackground);
  for (const pg of p.pages) bg(pg.background);
  for (const pn of panels) {
    bg(pn.background);
    for (const l of pn.layers) if (l.type === 'image') out.add(l.ref);
  }
  return [...out];
}
