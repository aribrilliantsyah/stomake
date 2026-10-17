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
import type { AssetInfo, Background, Layer, Project, ProjectSummary, ShapeKind } from '../../shared/types';
import { newId } from '../../shared/ids';
import { AssetError, listAssets as listAssetsOnDisk, saveAssets } from '../assets';
import { exportPdf as exportPdfOnDisk } from '../export';
import { agentLock, publish } from '../live';
import { isSafeName, isValidSlug } from '../paths';
import { noteMcpCall } from '../settings';
import { createProjectOnDisk, projectExists, queryProjects, readProject, readStoryline, updateProjectOnDisk, writeStoryline } from '../store';
import { ZodError } from 'zod';
import { svgToPng, SvgError } from '../svgAsset';
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

function applyPatch(l: Layer, patch: LayerPatch, assets: Map<string, AssetInfo> | null): Layer {
  const { opacity, assetRef, ...rest } = patch;
  const next: Record<string, unknown> = { ...l };
  const wrong = Object.keys(rest).filter((k) => rest[k as keyof typeof rest] !== undefined && !(k in l));
  if (wrong.length) throw new ToolError(`Properti tidak berlaku untuk layer ${l.type}: ${wrong.join(', ')}`);
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    if (v === null && !(NULLABLE.has(k) && l.type === 'shape') && !(k === 'stroke' && l.type === 'text'))
      throw new ToolError(`${k} tidak boleh kosong untuk layer ${l.type}`);
    if (k === 'text' && typeof v === 'string' && !v.trim()) throw new ToolError('Teks tidak boleh kosong');
    next[k] = v;
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
  const base = { id: l.id, type: l.type, x: Math.round(l.x), y: Math.round(l.y), rotation: l.rotation, opacity: Math.round(l.opacity * 100) };
  switch (l.type) {
    case 'image':
      return { ...base, ref: l.ref, width: l.width, height: l.height };
    case 'text':
      return { ...base, text: l.text, font: l.font, fontSize: l.fontSize, fill: l.fill };
    case 'shape':
      return { ...base, shape: l.shape, width: l.width, height: l.height, fill: l.fill, stroke: l.stroke };
    case 'emoji':
      return { ...base, char: l.char, size: l.size };
    case 'arrow':
      return { ...base, points: l.points, color: l.color };
  }
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

  /**
   * Agent-drawn illustration: SVG → PNG, saved as a project asset. Not a project.json write,
   * so the editor isn't locked; open editors get an `assets` event and refresh the Asset tab.
   */
  async addSvgAsset(i: ToolInput<'add_svg_asset'>): Promise<{ assetRef: string; name: string; width: number; height: number }> {
    need(i.slug);
    noteMcpCall();
    const base = i.name.replace(/\.(png|svg)$/i, '').trim();
    const name = `${base}.png`;
    if (!isSafeName(name)) throw new ToolError(`Nama tidak valid: ${i.name} (tanpa / \\ .. dan tidak diawali titik)`);
    let r;
    try {
      r = await svgToPng(i.svg, i.width);
    } catch (e) {
      if (e instanceof SvgError) throw new ToolError(e.message);
      throw e;
    }
    let saved;
    try {
      [saved] = await saveAssets('project', [{ name, data: r.png }], i.slug);
    } catch (e) {
      if (e instanceof AssetError) throw new ToolError(e.message);
      throw e;
    }
    if (!saved) throw new ToolError('Gambar gagal disimpan');
    publish(i.slug, { type: 'assets' });
    return { assetRef: saved.ref, name: saved.name, width: saved.width, height: saved.height };
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
