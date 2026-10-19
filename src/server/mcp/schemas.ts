import { z } from 'zod';
import { SHAPE_KINDS } from '../../shared/types';
import { PATTERN_KINDS } from '../patterns';

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
  text: z.string().min(1).describe('isi teks; \\n memaksa pindah baris'),
  font: z.string().optional().describe('nama font dari list_fonts, default Bangers'),
  fontSize: z.number().positive().optional(),
  fill: color.optional(),
  stroke: color.nullable().optional(),
  strokeWidth: z.number().min(0).optional(),
  width: z.number().positive().optional().describe('lebar kotak lipat teks (panel 1080); isi ini untuk kalimat panjang agar otomatis turun baris'),
  align: z.enum(['left', 'center', 'right']).optional().describe('perataan baris, default center; hanya berlaku bila width diisi'),
  lineHeight: z.number().min(0.5).max(4).optional().describe('jarak antar baris × fontSize, default 1'),
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
    width: z.number().positive().nullable().optional().describe('null pada layer text = matikan kotak lipat (kembali satu baris)'),
    height: z.number().min(0).optional(),
    text: z.string().optional(),
    font: z.string().optional(),
    fontSize: z.number().positive().optional(),
    fill: color.nullable().optional(),
    stroke: color.nullable().optional(),
    strokeWidth: z.number().min(0).optional(),
    align: z.enum(['left', 'center', 'right']).optional(),
    lineHeight: z.number().min(0.5).max(4).optional(),
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
  list_fonts: z.object({}),
  add_svg_asset: z.object({
    slug,
    name: z.string().trim().min(1).max(120).describe('nama file, mis. "gelas air" (.png ditambahkan otomatis)'),
    svg: z.string().min(1).describe('kode SVG lengkap dengan <svg ...>; pakai viewBox. Tanpa gambar/font eksternal. JANGAN menulis judul/subtitle di dalam SVG — pakai layer text supaya bisa diedit'),
    width: z.number().int().min(16).max(2048).optional().describe('lebar PNG dalam px; default atribut width SVG atau 1024'),
  }),
  add_pattern_asset: z.object({
    slug,
    name: z.string().trim().min(1).max(120).describe('nama file, mis. "bg grid lab"'),
    kind: z.enum(PATTERN_KINDS as unknown as [string, ...string[]]).describe('grid (kotak), graph (kertas milimeter), dots (titik), diagonal (garis miring), rays (sunburst), checker (papan catur), waves (gelombang)'),
    color: color.optional().describe('warna dasar, default #F3EDE4'),
    color2: color.optional().describe('bila diisi, dasar jadi gradien vertikal color → color2'),
    ink: color.optional().describe('warna motif, default #1F1E1B'),
    cell: z.number().int().min(8).max(600).optional().describe('jarak motif px, default 90'),
    thickness: z.number().min(0.5).max(40).optional().describe('tebal garis motif px, default 3'),
    inkOpacity: z.number().min(0.02).max(1).optional().describe('transparansi motif 0.02–1, default 0.18'),
    vignette: z.boolean().optional().describe('gelapkan sudut agar subjek di tengah lebih menonjol'),
    width: z.number().int().min(64).max(2048).optional().describe('lebar px, default 1080'),
    height: z.number().int().min(64).max(2048).optional().describe('tinggi px, default 1920 (960 untuk panel split)'),
  }),
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
  add_layers: z.object({
    slug,
    panelId: id,
    layers: z.array(layerSpec).min(1).max(30).describe('urutan belakang → depan; satu panggilan = satu langkah undo'),
  }),
  update_layer: z.object({ slug, panelId: id, layerId: id, patch: layerPatch }),
  remove_layer: z.object({ slug, panelId: id, layerId: id }),
  reorder_layer: z.object({ slug, panelId: id, layerId: id, to: z.enum(['up', 'down', 'top', 'bottom']) }),
  group_layers: z.object({
    slug,
    panelId: id,
    layerIds: z.array(id).min(1).describe('minimal 2 layer untuk grup; untuk ungroup cukup 1 anggota'),
    ungroup: z.boolean().optional().describe('true = lepas grup yang memuat layer ini'),
  }),
  check_storyboard: z.object({ slug }),
  export_pdf: z.object({ slug }),
  finish_editing: z.object({ slug }),
};

export type ToolName = keyof typeof schemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof schemas)[N]>;
