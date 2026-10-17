import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError } from 'zod';
import type { McpToolGroup } from '../../shared/types';
import { recordMcp } from './log';
import { ops, ToolError } from './ops';
import { schemas, type ToolName } from './schemas';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// inlined by the bundler for the desktop build (no package.json next to it there)
declare const __APP_VERSION__: string | undefined;
const VERSION: string = (() => {
  if (typeof __APP_VERSION__ === 'string') return __APP_VERSION__;
  try {
    return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/** Display order and grouping in Pengaturan; also the full list of tool names. */
export const TOOLS: { name: ToolName; group: McpToolGroup; description: string }[] = [
  { name: 'list_projects', group: 'read', description: 'Daftar project storyboard (maks 100). Default hanya yang aktif.' },
  { name: 'get_project', group: 'read', description: 'Struktur lengkap project: cover, page, scene (nomor, catatan, subtitle), panel dan layer beserta id-nya. Panggil ini dulu untuk mendapat id.' },
  { name: 'get_storyline', group: 'read', description: 'Teks storyline/naskah project.' },
  { name: 'list_assets', group: 'read', description: 'Asset gambar yang bisa dipakai (project: dan global:), dengan ukuran px.' },
  { name: 'create_project', group: 'edit', description: 'Buat project baru (1 page, 1 scene kosong). Mengembalikan slug.' },
  { name: 'set_storyline', group: 'edit', description: 'Ganti seluruh teks storyline project.' },
  { name: 'add_page', group: 'edit', description: 'Tambah page baru (1–3 scene kosong) setelah page tertentu (default di akhir).' },
  { name: 'add_scene', group: 'edit', description: 'Tambah scene kosong ke page (maks 3 scene per page).' },
  { name: 'remove_scene', group: 'edit', description: 'Hapus scene (minimal 1 scene per page).' },
  { name: 'remove_page', group: 'edit', description: 'Hapus page beserta scene-nya (minimal 1 page).' },
  { name: 'update_scene', group: 'edit', description: 'Ubah catatan efek (atas frame), subtitle/narasi (bawah frame), atau split atas-bawah.' },
  { name: 'set_cover', group: 'edit', description: 'Nyalakan/matikan cover (halaman "VISUAL ASLI" sebelum scene 1) dan judulnya.' },
  { name: 'set_background', group: 'edit', description: 'Atur background: "default" (semua page), {pageId}, atau {panelId} (frame scene/cover) dengan color atau assetRef.' },
  { name: 'add_layer', group: 'edit', description: 'Tambah layer ke panel: image (assetRef), text, shape, atau emoji. Koordinat pusat dalam panel 1080x1920 (960 bila split).' },
  { name: 'update_layer', group: 'edit', description: 'Ubah properti layer (posisi, ukuran, teks, warna, opacity 0–100, dll).' },
  { name: 'remove_layer', group: 'edit', description: 'Hapus layer.' },
  { name: 'reorder_layer', group: 'edit', description: 'Pindah urutan layer: up, down, top (paling depan), bottom.' },
  {
    name: 'add_svg_asset',
    group: 'asset',
    description: 'Gambar ilustrasi sendiri dengan kode SVG (bentuk, path, gradien; tanpa gambar/font eksternal). Disimpan sebagai PNG transparan di Asset project; pakai assetRef hasilnya di add_layer atau set_background.',
  },
  { name: 'export_pdf', group: 'output', description: 'Export storyboard ke PDF. Mengembalikan path file dan URL.' },
  { name: 'finish_editing', group: 'output', description: 'Panggil setelah selesai mengedit project agar editor user terbuka kembali.' },
];

const OPS: Record<ToolName, (i: never) => Promise<unknown>> = {
  list_projects: ops.listProjects,
  create_project: ops.createProject,
  get_project: ops.getProject,
  get_storyline: ops.getStoryline,
  set_storyline: ops.setStoryline,
  list_assets: ops.listAssets,
  add_svg_asset: ops.addSvgAsset,
  add_page: ops.addPage,
  add_scene: ops.addScene,
  remove_scene: ops.removeScene,
  remove_page: ops.removePage,
  update_scene: ops.updateScene,
  set_cover: ops.setCover,
  set_background: ops.setBackground,
  add_layer: ops.addLayer,
  update_layer: ops.updateLayer,
  remove_layer: ops.removeLayer,
  reorder_layer: ops.reorderLayer,
  export_pdf: ops.exportPdf,
  finish_editing: ops.finishEditing,
};

const slugOf = (input: unknown): string | null =>
  input && typeof input === 'object' && 'slug' in input && typeof input.slug === 'string' ? input.slug : null;

/**
 * A fresh MCP server (one per stateless request) with the allowed tools registered.
 * Disabled tools are not registered at all, so agents never see them in tools/list.
 * Each call is written to the MCP log with input, result and duration.
 */
export function buildMcpServer(opts: { allowed: (name: string) => boolean; client: string | null }): McpServer {
  const server = new McpServer({ name: 'storyboard-maker', version: VERSION }, { instructions: 'Storyboard 9:16: project → page (1–3 scene) → scene (panel 1080x1920). Panggil get_project untuk id, lalu finish_editing setelah selesai.' });
  for (const { name, description } of TOOLS) {
    if (!opts.allowed(name)) continue;
    server.registerTool(name, { description, inputSchema: schemas[name].shape }, (async (input: never) => {
      const t0 = performance.now();
      const done = (status: 'ok' | 'error', extra: { output?: unknown; error?: string }) =>
        recordMcp({ kind: 'call', tool: name, slug: slugOf(input), status, ms: Math.round(performance.now() - t0), client: opts.client, input, ...extra });
      try {
        const out = (await OPS[name](input)) as Record<string, unknown>;
        done('ok', { output: out });
        return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
      } catch (e) {
        let text: string;
        if (e instanceof ToolError) text = e.message;
        else if (e instanceof ZodError) text = `Input tidak valid: ${e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`;
        else {
          console.error(`mcp ${name}:`, e);
          text = `Gagal menjalankan ${name}: ${(e as Error).message}`;
        }
        done('error', { error: text });
        return { isError: true, content: [{ type: 'text', text }] };
      }
    }) as never);
  }
  return server;
}
