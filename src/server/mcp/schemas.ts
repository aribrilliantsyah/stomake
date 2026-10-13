import { z } from 'zod';
import { SHAPE_KINDS } from '../../shared/types';

const slug = z.string().min(1).describe('slug project (dari list_projects / create_project)');
const id = z.string().min(1);
const color = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'warna hex, mis. #FF0000');
const assetRef = z.string().regex(/^(global|project):.+/, 'format "project:nama.png" atau "global:nama.png"');
const pct = z.number().min(0).max(100).describe('0–100 (%)');

const common = {
  x: z.number().optional().describe('pusat X dalam panel space (lebar 1080); default tengah'),
  y: z.number().optional().describe('pusat Y (tinggi 1920, atau 960 bila scene split); default tengah'),
  rotation: z.number().optional(),
  opacity: pct.optional(),
};

const imageSpec = z.object({ type: z.literal('image'), assetRef, width: z.number().positive().optional().describe('default 60% lebar panel'), flipX: z.boolean().optional(), flipY: z.boolean().optional(), ...common });
const textSpec = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
  font: z.string().optional().describe('nama font, default Bangers'),
  fontSize: z.number().positive().optional(),
  fill: color.optional(),
  stroke: color.nullable().optional(),
  strokeWidth: z.number().min(0).optional(),
  ...common,
});
const shapeSpec = z.object({
  type: z.literal('shape'),
  shape: z.enum(SHAPE_KINDS as unknown as [string, ...string[]]),
  width: z.number().positive().optional(),
  height: z.number().min(0).optional(),
  fill: color.nullable().optional(),
  stroke: color.nullable().optional(),
  strokeWidth: z.number().min(0).optional(),
  dash: z.boolean().optional(),
  ...common,
});
const emojiSpec = z.object({ type: z.literal('emoji'), char: z.string().min(1), size: z.number().positive().optional(), ...common });

export const layerSpec = z.discriminatedUnion('type', [imageSpec, textSpec, shapeSpec, emojiSpec]);
export type LayerSpec = z.infer<typeof layerSpec>;

export const layerPatch = z
  .object({
    ...common,
    width: z.number().positive().optional(),
    height: z.number().min(0).optional(),
    text: z.string().optional(),
    font: z.string().optional(),
    fontSize: z.number().positive().optional(),
    fill: color.nullable().optional(),
    stroke: color.nullable().optional(),
    strokeWidth: z.number().min(0).optional(),
    dash: z.boolean().optional(),
    char: z.string().optional(),
    size: z.number().positive().optional(),
    flipX: z.boolean().optional(),
    flipY: z.boolean().optional(),
    assetRef: assetRef.optional(),
  })
  .strict();
export type LayerPatch = z.infer<typeof layerPatch>;

/** Input schemas, one per tool (snake_case names map to camelCase ops). */
export const schemas = {
  list_projects: z.object({ q: z.string().optional(), status: z.enum(['active', 'archived', 'all']).optional() }),
  create_project: z.object({ name: z.string().trim().min(1).max(120) }),
  get_project: z.object({ slug }),
  get_storyline: z.object({ slug }),
  set_storyline: z.object({ slug, text: z.string() }),
  list_assets: z.object({ slug }),
  add_page: z.object({ slug, afterPageId: id.optional().describe('default: setelah page terakhir'), scenes: z.number().int().min(1).max(3).optional() }),
  add_scene: z.object({ slug, pageId: id, afterSceneId: id.optional() }),
  remove_scene: z.object({ slug, sceneId: id }),
  remove_page: z.object({ slug, pageId: id }),
  update_scene: z.object({ slug, sceneId: id, note: z.string().optional().describe('catatan efek (atas frame)'), subtitle: z.string().optional().describe('narasi (bawah frame)'), split: z.boolean().optional() }),
  set_cover: z.object({ slug, enabled: z.boolean(), title: z.string().optional() }),
  set_background: z.object({
    slug,
    target: z.union([z.literal('default'), z.object({ pageId: id }), z.object({ panelId: id })]).describe('"default" = semua page, {pageId}, atau {panelId} (scene/cover)'),
    color: color.optional(),
    assetRef: assetRef.optional(),
    fit: z.enum(['cover', 'contain']).optional(),
    reset: z.boolean().optional().describe('hanya untuk {pageId}: kembali ikut default'),
  }),
  add_layer: z.object({ slug, panelId: id, layer: layerSpec }),
  update_layer: z.object({ slug, panelId: id, layerId: id, patch: layerPatch }),
  remove_layer: z.object({ slug, panelId: id, layerId: id }),
  reorder_layer: z.object({ slug, panelId: id, layerId: id, to: z.enum(['up', 'down', 'top', 'bottom']) }),
  export_pdf: z.object({ slug }),
  finish_editing: z.object({ slug }),
};

export type ToolName = keyof typeof schemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof schemas)[N]>;
