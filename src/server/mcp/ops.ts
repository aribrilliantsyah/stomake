import { panelSpace } from '../../shared/layout';
import {
  addCover,
  addLayer as addLayerTo,
  addPage as addPageTo,
  addSceneInPage,
  canRemoveScene,
  defaultEmoji,
  defaultShape,
  defaultText,
  findPanel,
  findScene,
  flatScenes,
  removeCover,
  removeLayer as removeLayerFrom,
  removePage as removePageFrom,
  removeScene as removeSceneFrom,
  reorderLayer as reorderLayerIn,
  setPageBackground,
  setSplit,
  updateCover,
  updatePanel,
  updateScene as updateSceneIn,
} from '../../shared/model';
import type { AssetInfo, Background, Layer, Panel, Project, ProjectSummary, ShapeKind } from '../../shared/types';
import { BUILTIN_FONTS } from '../../shared/fonts';
import { groupLayers as groupLayersIn, ungroupLayers } from '../../shared/multi';
import { newId } from '../../shared/ids';
import { AssetError, listAssets as listAssetsOnDisk, saveAssets } from '../assets';
import { PATTERN_DEFAULTS, patternSvg, type PatternKind } from '../patterns';
import { exportPdf as exportPdfOnDisk } from '../export';
import { agentLock, publish } from '../live';
import { isSafeName, isValidSlug } from '../paths';
import { noteMcpCall } from '../settings';
import { createProjectOnDisk, projectExists, queryProjects, readProject, readStoryline, updateProjectOnDisk, writeStoryline } from '../store';
import { ZodError } from 'zod';
import { findTextElement, svgToPng, SvgError } from '../svgAsset';
import type { LayerPatch, LayerSpec, ToolInput } from './schemas';

/** An error whose message is meant for the agent (returned as isError, project untouched). */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Base URL Chromium uses for export; set by the route from the app options. */
let exportBaseUrl = 'http://localhost:5173';
export function setExportBaseUrl(u: string): void {
  exportBaseUrl = u;
}
let publicBase = 'http://127.0.0.1:5178';
export function setPublicBase(u: string): void {
  publicBase = u;
}

function need(slug: string): void {
  if (!isValidSlug(slug) || !projectExists(slug)) throw new ToolError(`Project tidak ditemukan: ${slug}`);
}

/** Read-modify-write a project as the agent: lock, write under the slug queue, publish to editors. */
async function mutate<R>(slug: string, fn: (p: Project) => { project: Project; result: R }): Promise<R> {
  need(slug);
  noteMcpCall();
  // validate against the current version first so a bad id never locks the user's editor
  try {
    fn(await readProject(slug));
  } catch (e) {
    if (e instanceof ToolError) throw e;
  }
  await agentLock.beginOrExtend(slug);
  let out: { project: Project; result: R };
  try {
    out = await updateProjectOnDisk(slug, fn);
  } catch (e) {
    if (e instanceof ZodError) throw new ToolError(`Data tidak valid: ${e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
    throw e;
  }
  publish(slug, { type: 'project', project: out.project });
  return out.result;
}

const same = <R>(project: Project, result: R) => ({ project, result });

function sceneOrThrow(p: Project, sceneId: string) {
  const s = findScene(p, sceneId);
  if (!s) throw new ToolError(`Scene tidak ditemukan: ${sceneId}`);
  return s;
}

function panelOrThrow(p: Project, panelId: string) {
  const f = findPanel(p, panelId);
  if (!f) throw new ToolError(`Panel tidak ditemukan: ${panelId}`);
  return f;
}

function pageIndexOrThrow(p: Project, pageId: string): number {
  const i = p.pages.findIndex((pg) => pg.id === pageId);
  if (i < 0) throw new ToolError(`Page tidak ditemukan: ${pageId}`);
  return i;
}

async function assetIndex(slug: string): Promise<Map<string, AssetInfo>> {
  const a = await listAssetsOnDisk(slug);
  return new Map([...a.project, ...a.global].map((x) => [x.ref, x]));
}

function assetOrThrow(assets: Map<string, AssetInfo>, ref: string): AssetInfo {
  const a = assets.get(ref);
  if (!a) throw new ToolError(`Asset tidak ditemukan: ${ref}`);
  return a;
}

const toOpacity = (pct: number | undefined, fallback: number) => (pct === undefined ? fallback : Math.max(0, Math.min(100, pct)) / 100);

/** Agent layer description → full layer with the same defaults as the editor's toolbar. */
export function layerFromSpec(spec: LayerSpec, space: { w: number; h: number }, assets: Map<string, AssetInfo>): Layer {
  const pos = { x: spec.x ?? space.w / 2, y: spec.y ?? space.h / 2, rotation: spec.rotation ?? 0 };
  switch (spec.type) {
    case 'image': {
      const a = assetOrThrow(assets, spec.assetRef);
      const width = Math.round(spec.width ?? space.w * 0.6);
      const height = Math.round((width * a.height) / Math.max(1, a.width));
      return { id: newId(), type: 'image', ref: a.ref, width, height, flipX: spec.flipX ?? false, flipY: spec.flipY ?? false, ...pos, opacity: toOpacity(spec.opacity, 1) };
    }
    case 'text': {
      const d = defaultText(space);
      return {
        ...d,
        ...pos,
        text: spec.text,
        font: spec.font ?? d.font,
        fontSize: spec.fontSize ?? d.fontSize,
        fill: spec.fill ?? d.fill,
        stroke: spec.stroke === undefined ? d.stroke : spec.stroke,
        strokeWidth: spec.strokeWidth ?? d.strokeWidth,
        opacity: toOpacity(spec.opacity, 1),
        ...(spec.width === undefined ? null : { width: spec.width }),
        // align/lineHeight only mean something inside a wrap box
        ...(spec.width === undefined ? null : { align: spec.align ?? 'center' }),
        ...(spec.lineHeight === undefined ? null : { lineHeight: spec.lineHeight }),
      };
    }
    case 'shape': {
      const d = defaultShape(spec.shape as ShapeKind, space);
      return {
        ...d,
        ...pos,
        width: spec.width ?? d.width,
        height: spec.height ?? d.height,
        fill: spec.fill === undefined ? d.fill : spec.fill,
        stroke: spec.stroke === undefined ? d.stroke : spec.stroke,
        strokeWidth: spec.strokeWidth ?? d.strokeWidth,
        dash: spec.dash ?? d.dash,
        opacity: toOpacity(spec.opacity, 1),
      };
    }
    case 'emoji': {
      const d = defaultEmoji(spec.char, space);
      return { ...d, ...pos, size: spec.size ?? d.size, opacity: toOpacity(spec.opacity, 1) };
    }
  }
}

const NULLABLE = new Set(['stroke', 'fill']);
/** Text properties that are absent until the agent turns the layer into a wrap box. */
const TEXT_BOX: Record<string, true> = { width: true, align: true, lineHeight: true };

function applyPatch(l: Layer, patch: LayerPatch, assets: Map<string, AssetInfo> | null): Layer {
  const { opacity, assetRef, ...rest } = patch;
  const next: Record<string, unknown> = { ...l };
  const wrong = Object.keys(rest).filter((k) => rest[k as keyof typeof rest] !== undefined && !(k in l) && !(l.type === 'text' && TEXT_BOX[k]));
  if (wrong.length) throw new ToolError(`Properti tidak berlaku untuk layer ${l.type}: ${wrong.join(', ')}`);
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (v === null && !(NULLABLE.has(k) && l.type === 'shape') && !(k === 'stroke' && l.type === 'text') && !(k === 'width' && l.type === 'text'))
      throw new ToolError(`${k} tidak boleh kosong untuk layer ${l.type}`);
    if (k === 'text' && typeof v === 'string' && !v.trim()) throw new ToolError('Teks tidak boleh kosong');
    next[k] = v;
  }
  if (l.type === 'text') {
    // width: null drops the wrap box; align/lineHeight only exist inside one
    if (rest.width === null) for (const k of Object.keys(TEXT_BOX)) delete next[k];
    else if (next.width === undefined && (rest.align !== undefined || rest.lineHeight !== undefined))
      throw new ToolError('align/lineHeight butuh width (kotak lipat teks) pada layer ini');
    else if (next.width !== undefined && next.align === undefined) next.align = 'center';
  }
  if (opacity !== undefined) next.opacity = toOpacity(opacity, l.opacity);
  if (assetRef !== undefined) {
    if (l.type !== 'image') throw new ToolError('assetRef hanya untuk layer image');
    next.ref = assetOrThrow(assets!, assetRef).ref;
  }
  return next as unknown as Layer;
}

function bgFrom(input: { color?: string; assetRef?: string; fit?: 'cover' | 'contain' }, assets: Map<string, AssetInfo>): Background {
  if (!!input.color === !!input.assetRef) throw new ToolError('Isi tepat satu: color atau assetRef');
  if (input.color) return { kind: 'color', color: input.color.toUpperCase() };
  return { kind: 'asset', ref: assetOrThrow(assets, input.assetRef!).ref, fit: input.fit ?? 'cover' };
}

/** Compact view of a layer for get_project. */
function layerOutline(l: Layer) {
  const base = { id: l.id, type: l.type, x: Math.round(l.x), y: Math.round(l.y), rotation: l.rotation, opacity: Math.round(l.opacity * 100), ...(l.groupId ? { groupId: l.groupId } : null) };
  switch (l.type) {
    case 'image':
      return { ...base, ref: l.ref, width: l.width, height: l.height };
    case 'text':
      return { ...base, text: l.text, font: l.font, fontSize: l.fontSize, fill: l.fill, width: l.width, align: l.align, lineHeight: l.lineHeight };
    case 'shape':
      return { ...base, shape: l.shape, width: l.width, height: l.height, fill: l.fill, stroke: l.stroke };
    case 'emoji':
      return { ...base, char: l.char, size: l.size };
    case 'arrow':
      return { ...base, points: l.points, color: l.color };
  }
}

/**
 * Render agent-supplied SVG to a PNG in the project's assets (shared by add_svg_asset and
 * add_pattern_asset). Writes no project.json, so the user's editor keeps its lock-free state.
 */
async function saveSvgAsset(slug: string, rawName: string, svg: string, width?: number) {
  const name = `${rawName.replace(/\.(png|svg)$/i, '').trim()}.png`;
  if (!isSafeName(name)) throw new ToolError(`Nama tidak valid: ${rawName} (tanpa / \\ .. dan tidak diawali titik)`);
  let r;
  try {
    r = await svgToPng(svg, width);
  } catch (e) {
    if (e instanceof SvgError) throw new ToolError(e.message);
    throw e;
  }
  let saved;
  try {
    [saved] = await saveAssets('project', [{ name, data: r.png }], slug);
  } catch (e) {
    if (e instanceof AssetError) throw new ToolError(e.message);
    throw e;
  }
  if (!saved) throw new ToolError('Gambar gagal disimpan');
  publish(slug, { type: 'assets' });
  return { assetRef: saved.ref, name: saved.name, width: saved.width, height: saved.height };
}

export const ops = {
  async listProjects(i: ToolInput<'list_projects'>): Promise<{ items: ProjectSummary[] }> {
    noteMcpCall();
    return { items: (await queryProjects({ q: i.q, status: i.status ?? 'active', size: 100 })).items };
  },

  async createProject(i: ToolInput<'create_project'>): Promise<{ slug: string }> {
    noteMcpCall();
    return { slug: await createProjectOnDisk(i.name) };
  },

  async getProject(i: ToolInput<'get_project'>) {
    need(i.slug);
    noteMcpCall();
    const p = await readProject(i.slug);
    const numbers = new Map(flatScenes(p).map((f) => [f.scene.id, f.number]));
    return {
      slug: i.slug,
      name: p.name,
      pageBackground: p.pageBackground,
      cover: p.cover ? { id: p.cover.id, title: p.cover.title, panelId: p.cover.panel.id, background: p.cover.panel.background, layers: p.cover.panel.layers.map(layerOutline) } : null,
      pages: p.pages.map((pg, index) => ({
        id: pg.id,
        index,
        background: pg.background,
        scenes: pg.scenes.map((s) => ({
          id: s.id,
          number: numbers.get(s.id)!,
          note: s.note,
          subtitle: s.subtitle,
          split: s.split,
          panels: s.panels.map((pn) => ({ id: pn.id, background: pn.background, layers: pn.layers.map(layerOutline) })),
        })),
      })),
    };
  },

  async getStoryline(i: ToolInput<'get_storyline'>): Promise<{ text: string }> {
    need(i.slug);
    noteMcpCall();
    return { text: await readStoryline(i.slug) };
  },

  async setStoryline(i: ToolInput<'set_storyline'>): Promise<{ ok: true }> {
    need(i.slug);
    noteMcpCall();
    await agentLock.beginOrExtend(i.slug);
    await writeStoryline(i.slug, i.text, 'agent');
    publish(i.slug, { type: 'storyline', text: i.text });
    return { ok: true };
  },

  async listAssets(i: ToolInput<'list_assets'>) {
    need(i.slug);
    noteMcpCall();
    return listAssetsOnDisk(i.slug);
  },

  /** Font names the renderer and the PDF export can actually draw. */
  async listFonts(): Promise<{ fonts: string[]; default: string }> {
    noteMcpCall();
    return { fonts: [...BUILTIN_FONTS], default: defaultText({ w: 1080, h: 1920 }).font };
  },

  /**
   * Agent-drawn illustration: SVG → PNG, saved as a project asset. Not a project.json write,
   * so the editor isn't locked; open editors get an `assets` event and refresh the Asset tab.
   */
  async addSvgAsset(i: ToolInput<'add_svg_asset'>): Promise<{ assetRef: string; name: string; width: number; height: number }> {
    need(i.slug);
    noteMcpCall();
    const el = findTextElement(i.svg);
    if (el) throw new ToolError(`SVG berisi <${el}>: teks di dalam gambar tidak memakai font aplikasi dan tidak bisa diedit user. Gambar ilustrasinya saja, lalu tambahkan teks dengan add_layer type "text".`);
    return saveSvgAsset(i.slug, i.name, i.svg, i.width);
  },

  /**
   * Patterned background (grid, graph paper, dots, sunburst, …) rendered to a PNG asset,
   * so a scene never has to sit on a flat colour. Same asset path as addSvgAsset.
   */
  async addPatternAsset(i: ToolInput<'add_pattern_asset'>): Promise<{ assetRef: string; name: string; width: number; height: number }> {
    need(i.slug);
    noteMcpCall();
    const svg = patternSvg({ ...i, kind: i.kind as PatternKind });
    return saveSvgAsset(i.slug, i.name, svg, i.width ?? PATTERN_DEFAULTS.width);
  },

  async addPage(i: ToolInput<'add_page'>): Promise<{ pageId: string; sceneIds: string[] }> {
    return mutate(i.slug, (p) => {
      const after = i.afterPageId ?? p.pages[p.pages.length - 1].id;
      pageIndexOrThrow(p, after);
      const r = addPageTo(p, after);
      let project = r.project;
      const sceneIds = [r.sceneId];
      for (let n = 1; n < (i.scenes ?? 1); n++) {
        const s = addSceneInPage(project, r.pageId, sceneIds[sceneIds.length - 1])!;
        project = s.project;
        sceneIds.push(s.sceneId);
      }
      return same(project, { pageId: r.pageId, sceneIds });
    });
  },

  async addScene(i: ToolInput<'add_scene'>): Promise<{ sceneId: string; number: number }> {
    return mutate(i.slug, (p) => {
      const pi = pageIndexOrThrow(p, i.pageId);
      if (i.afterSceneId && !p.pages[pi].scenes.some((s) => s.id === i.afterSceneId)) throw new ToolError(`Scene ${i.afterSceneId} tidak ada di page ini`);
      const r = addSceneInPage(p, i.pageId, i.afterSceneId ?? null);
      if (!r) throw new ToolError('Page sudah berisi 3 scene');
      const number = flatScenes(r.project).find((f) => f.scene.id === r.sceneId)!.number;
      return same(r.project, { sceneId: r.sceneId, number });
    });
  },

  async removeScene(i: ToolInput<'remove_scene'>): Promise<{ ok: true }> {
    return mutate(i.slug, (p) => {
      sceneOrThrow(p, i.sceneId);
      if (!canRemoveScene(p, i.sceneId)) throw new ToolError('Scene terakhir di page tidak bisa dihapus — hapus page-nya');
      return same(removeSceneFrom(p, i.sceneId), { ok: true as const });
    });
  },

  async removePage(i: ToolInput<'remove_page'>): Promise<{ ok: true }> {
    return mutate(i.slug, (p) => {
      pageIndexOrThrow(p, i.pageId);
      if (p.pages.length <= 1) throw new ToolError('Page terakhir tidak bisa dihapus');
      return same(removePageFrom(p, i.pageId), { ok: true as const });
    });
  },

  async updateScene(i: ToolInput<'update_scene'>): Promise<{ ok: true }> {
    return mutate(i.slug, (p) => {
      sceneOrThrow(p, i.sceneId);
      let next = p;
      const patch: { note?: string; subtitle?: string } = {};
      if (i.note !== undefined) patch.note = i.note;
      if (i.subtitle !== undefined) patch.subtitle = i.subtitle;
      if (Object.keys(patch).length) next = updateSceneIn(next, i.sceneId, patch);
      if (i.split !== undefined) next = setSplit(next, i.sceneId, i.split);
      return same(next, { ok: true as const });
    });
  },

  async setCover(i: ToolInput<'set_cover'>): Promise<{ coverPanelId: string | null }> {
    return mutate<{ coverPanelId: string | null }>(i.slug, (p) => {
      if (!i.enabled) return same(removeCover(p), { coverPanelId: null });
      let next = addCover(p);
      if (i.title !== undefined) next = updateCover(next, { title: i.title });
      return same(next, { coverPanelId: next.cover!.panel.id });
    });
  },

  async setBackground(i: ToolInput<'set_background'>): Promise<{ ok: true }> {
    need(i.slug);
    const assets = await assetIndex(i.slug);
    return mutate(i.slug, (p) => {
      const t = i.target;
      if (i.reset && (i.color || i.assetRef)) throw new ToolError('reset tidak bisa digabung dengan color/assetRef');
      if (t !== 'default' && 'pageId' in t) {
        const pi = pageIndexOrThrow(p, t.pageId);
        if (i.reset) return same(setPageBackground(p, pi, null), { ok: true as const });
        return same(setPageBackground(p, pi, bgFrom(i, assets)), { ok: true as const });
      }
      if (i.reset) throw new ToolError('reset hanya untuk target {pageId}');
      const bg = bgFrom(i, assets);
      if (t === 'default') return same({ ...p, pageBackground: bg }, { ok: true as const });
      panelOrThrow(p, t.panelId);
      return same(updatePanel(p, t.panelId, (pn) => ({ ...pn, background: bg })), { ok: true as const });
    });
  },

  async addLayer(i: ToolInput<'add_layer'>): Promise<{ layerId: string }> {
    need(i.slug);
    const assets = i.layer.type === 'image' ? await assetIndex(i.slug) : new Map<string, AssetInfo>();
    return mutate(i.slug, (p) => {
      const { scene } = panelOrThrow(p, i.panelId);
      const layer = layerFromSpec(i.layer, panelSpace(scene?.split ?? false), assets);
      return same(addLayerTo(p, i.panelId, layer), { layerId: layer.id });
    });
  },

  /** Several layers in one write: one lock cycle, one live event, one undo step for the user. */
  async addLayers(i: ToolInput<'add_layers'>): Promise<{ layerIds: string[] }> {
    need(i.slug);
    const assets = i.layers.some((l) => l.type === 'image') ? await assetIndex(i.slug) : new Map<string, AssetInfo>();
    return mutate(i.slug, (p) => {
      const { scene } = panelOrThrow(p, i.panelId);
      const space = panelSpace(scene?.split ?? false);
      let project = p;
      const layerIds: string[] = [];
      for (const spec of i.layers) {
        const layer = layerFromSpec(spec, space, assets);
        project = addLayerTo(project, i.panelId, layer);
        layerIds.push(layer.id);
      }
      return same(project, { layerIds });
    });
  },

  async updateLayer(i: ToolInput<'update_layer'>): Promise<{ ok: true }> {
    need(i.slug);
    const assets = i.patch.assetRef ? await assetIndex(i.slug) : null;
    return mutate(i.slug, (p) => {
      const { panel } = panelOrThrow(p, i.panelId);
      const l = panel.layers.find((x) => x.id === i.layerId);
      if (!l) throw new ToolError(`Layer tidak ditemukan: ${i.layerId}`);
      const next = applyPatch(l, i.patch, assets);
      return same(updatePanel(p, i.panelId, (pn) => ({ ...pn, layers: pn.layers.map((x) => (x.id === l.id ? next : x)) })), { ok: true as const });
    });
  },

  async removeLayer(i: ToolInput<'remove_layer'>): Promise<{ ok: true }> {
    return mutate(i.slug, (p) => {
      const { panel } = panelOrThrow(p, i.panelId);
      if (!panel.layers.some((x) => x.id === i.layerId)) throw new ToolError(`Layer tidak ditemukan: ${i.layerId}`);
      return same(removeLayerFrom(p, i.panelId, i.layerId), { ok: true as const });
    });
  },

  async reorderLayer(i: ToolInput<'reorder_layer'>): Promise<{ ok: true }> {
    return mutate(i.slug, (p) => {
      const { panel } = panelOrThrow(p, i.panelId);
      if (!panel.layers.some((x) => x.id === i.layerId)) throw new ToolError(`Layer tidak ditemukan: ${i.layerId}`);
      return same(reorderLayerIn(p, i.panelId, i.layerId, i.to), { ok: true as const });
    });
  },

  /** Lock several layers together (or release the group) so the user drags them as one object. */
  async groupLayers(i: ToolInput<'group_layers'>): Promise<{ groupId: string | null }> {
    return mutate<{ groupId: string | null }>(i.slug, (p) => {
      const { panel } = panelOrThrow(p, i.panelId);
      const missing = i.layerIds.filter((id) => !panel.layers.some((l) => l.id === id));
      if (missing.length) throw new ToolError(`Layer tidak ditemukan: ${missing.join(', ')}`);
      if (i.ungroup) return same(ungroupLayers(p, i.panelId, i.layerIds), { groupId: null });
      const r = groupLayersIn(p, i.panelId, i.layerIds);
      if (!r.groupId) throw new ToolError('Grup butuh minimal 2 layer berbeda');
      return same(r.project, { groupId: r.groupId });
    });
  },

  /**
   * Read-only quality pass over a finished storyboard: catches the mistakes that only show up
   * in the exported PDF (unreadable text, layers off-frame, missing assets, flat empty frames).
   */
  async checkStoryboard(i: ToolInput<'check_storyboard'>): Promise<{ ok: boolean; issues: { level: 'error' | 'warning'; where: string; message: string }[] }> {
    need(i.slug);
    noteMcpCall();
    const p = await readProject(i.slug);
    const assets = await assetIndex(i.slug);
    const issues: { level: 'error' | 'warning'; where: string; message: string }[] = [];
    const add = (level: 'error' | 'warning', where: string, message: string) => issues.push({ level, where, message });

    const frames: { where: string; split: boolean; panels: Panel[]; subtitle: string | null; background: Background | null }[] = [];
    if (p.cover) frames.push({ where: 'Cover', split: false, panels: [p.cover.panel], subtitle: null, background: null });
    for (const f of flatScenes(p)) frames.push({ where: `Scene ${f.number}`, split: f.scene.split, panels: f.scene.panels, subtitle: f.scene.subtitle, background: p.pages[f.pageIndex].background ?? p.pageBackground });

    let plainFrames = 0;
    for (const f of frames) {
      if (f.subtitle !== null && !f.subtitle.trim()) add('warning', f.where, 'Subtitle kosong — penonton tidak tahu kalimat yang dibacakan di scene ini');
      const space = panelSpace(f.split);
      for (const pn of f.panels) {
        if (pn.background.kind === 'asset' && !assets.has(pn.background.ref)) add('error', f.where, `Background hilang: ${pn.background.ref}`);
        if (pn.background.kind === 'color') plainFrames++;
        if (!pn.layers.length) add('warning', f.where, 'Frame kosong — belum ada gambar, teks, atau shape');
        for (const l of pn.layers) {
          if (l.type === 'image' && !assets.has(l.ref)) add('error', f.where, `Asset hilang: ${l.ref}`);
          if (l.x < 0 || l.x > space.w || l.y < 0 || l.y > space.h) add('warning', f.where, `Layer ${l.type} di luar frame (x ${Math.round(l.x)}, y ${Math.round(l.y)}; frame ${space.w}×${space.h})`);
          if (l.type === 'text') {
            // the frame is printed 198pt wide, so a panel unit is ~0.183pt: below 48 units text drops under 9pt
            if (l.fontSize < 48) add('warning', f.where, `Teks "${l.text.slice(0, 24)}" fontSize ${l.fontSize} terlalu kecil untuk PDF (minimal 48)`);
            if (!l.width && l.text.length > 24) add('warning', f.where, `Teks "${l.text.slice(0, 24)}…" panjang tanpa width — akan jadi satu baris yang keluar frame`);
            if (l.width && l.width > space.w) add('warning', f.where, `Lebar kotak teks ${l.width} melebihi frame ${space.w}`);
          }
        }
      }
    }
    if (frames.length >= 3 && plainFrames === frames.reduce((n, f) => n + f.panels.length, 0))
      add('warning', 'Project', 'Semua frame memakai background warna polos — pakai add_pattern_asset (grid, graph, dots, rays) atau gambar agar tidak monoton');

    return { ok: !issues.some((x) => x.level === 'error'), issues };
  },

  async exportPdf(i: ToolInput<'export_pdf'>) {
    need(i.slug);
    noteMcpCall();
    const r = await exportPdfOnDisk(i.slug, exportBaseUrl);
    return { path: r.path, url: `${publicBase}/api/projects/${i.slug}/export.pdf`, missingAssets: r.missingAssets, missingFonts: r.missingFonts };
  },

  async finishEditing(i: ToolInput<'finish_editing'>): Promise<{ ok: true }> {
    need(i.slug);
    noteMcpCall();
    agentLock.release(i.slug);
    return { ok: true };
  },
};
