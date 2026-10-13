import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ZodError } from 'zod';
import { ops, ToolError } from './ops';
import { schemas, type ToolName } from './schemas';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const DESCRIPTIONS: Record<ToolName, string> = {
  list_projects: 'Daftar project storyboard (maks 100). Default hanya yang aktif.',
  create_project: 'Buat project baru (1 page, 1 scene kosong). Mengembalikan slug.',
  get_project: 'Struktur lengkap project: cover, page, scene (nomor, catatan, subtitle), panel dan layer beserta id-nya. Panggil ini dulu untuk mendapat id.',
  get_storyline: 'Teks storyline/naskah project.',
  set_storyline: 'Ganti seluruh teks storyline project.',
  list_assets: 'Asset gambar yang bisa dipakai (project: dan global:), dengan ukuran px.',
  add_page: 'Tambah page baru (1–3 scene kosong) setelah page tertentu (default di akhir).',
  add_scene: 'Tambah scene kosong ke page (maks 3 scene per page).',
  remove_scene: 'Hapus scene (minimal 1 scene per page).',
  remove_page: 'Hapus page beserta scene-nya (minimal 1 page).',
  update_scene: 'Ubah catatan efek (atas frame), subtitle/narasi (bawah frame), atau split atas-bawah.',
  set_cover: 'Nyalakan/matikan cover (halaman "VISUAL ASLI" sebelum scene 1) dan judulnya.',
  set_background: 'Atur background: "default" (semua page), {pageId}, atau {panelId} (frame scene/cover) dengan color atau assetRef.',
  add_layer: 'Tambah layer ke panel: image (assetRef), text, shape, atau emoji. Koordinat pusat dalam panel 1080x1920 (960 bila split).',
  update_layer: 'Ubah properti layer (posisi, ukuran, teks, warna, opacity 0–100, dll).',
  remove_layer: 'Hapus layer.',
  reorder_layer: 'Pindah urutan layer: up, down, top (paling depan), bottom.',
  export_pdf: 'Export storyboard ke PDF. Mengembalikan path file dan URL.',
  finish_editing: 'Panggil setelah selesai mengedit project agar editor user terbuka kembali.',
};

const OPS: Record<ToolName, (i: never) => Promise<unknown>> = {
  list_projects: ops.listProjects,
  create_project: ops.createProject,
  get_project: ops.getProject,
  get_storyline: ops.getStoryline,
  set_storyline: ops.setStoryline,
  list_assets: ops.listAssets,
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

/** A fresh MCP server with every storyboard tool registered (one per stateless request). */
export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'storyboard-maker', version: VERSION }, { instructions: 'Storyboard 9:16: project → page (1–3 scene) → scene (panel 1080x1920). Panggil get_project untuk id, lalu finish_editing setelah selesai.' });
  for (const name of Object.keys(schemas) as ToolName[]) {
    server.registerTool(name, { description: DESCRIPTIONS[name], inputSchema: schemas[name].shape }, (async (input: never) => {
      try {
        const out = (await OPS[name](input)) as Record<string, unknown>;
        return { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out };
      } catch (e) {
        if (e instanceof ToolError) return { isError: true, content: [{ type: 'text', text: e.message }] };
        if (e instanceof ZodError) return { isError: true, content: [{ type: 'text', text: `Input tidak valid: ${e.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}` }] };
        console.error(`mcp ${name}:`, e);
        return { isError: true, content: [{ type: 'text', text: `Gagal menjalankan ${name}: ${(e as Error).message}` }] };
      }
    }) as never);
  }
  return server;
}
