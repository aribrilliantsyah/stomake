# Storyboard Maker V3 — MCP (agent) + Dark Mode

Di atas `docs/SPEC.md` dan `docs/SPEC-V2.md`. Tanggal: 2026-10-13.

## 1. Tujuan

1. Agent AI (Hermes, Claude Code, Cursor, dll.) bisa menggerakkan aplikasi lewat **MCP** di URL HTTP lokal, setelah user menyalakannya di **Pengaturan**.
2. Saat agent mengubah project yang sedang dibuka, editor menampilkan perubahan **secara live**. Selama agent bekerja, user **tidak bisa mengedit**, dan badge "AI sedang bekerja" tampil.
3. Tombol **mode gelap** untuk UI aplikasi.

Di luar cakupan: agentic mode dengan model OpenAI-compatible di dalam aplikasi, transport stdio, dan auth/token. Server hanya mendengarkan di 127.0.0.1.

## 2. Pengaturan

- Disimpan server di `~/Storyboard/settings.json`: `{ "mcp": { "enabled": false } }`. File tidak ada atau rusak berarti default (MCP mati).
- `GET /api/settings` → `{ mcp: { enabled, url, lastCallAt } }`. `url` = `http://127.0.0.1:<PORT>/mcp`. `lastCallAt` = waktu ISO tool terakhir dipanggil sejak server jalan, atau `null`.
- `PUT /api/settings` dengan body `{ mcp: { enabled: boolean } }` → settings baru. Body lain → 400.
- UI: tombol ⚙ **Pengaturan** di header Home dan toolbar editor membuka dialog. Isinya:
  - Tema: Terang / Gelap / Ikuti sistem.
  - MCP: switch Aktif, URL (monospace) + tombol Salin, contoh konfigurasi JSON + tombol Salin, dan status "Agent terakhir aktif: <waktu relatif | belum pernah>".
- Tema disimpan di browser (localStorage `sb.theme`: `light | dark | system`, default `system`). MCP disimpan di server.

## 3. Endpoint MCP

- `ALL /mcp`: Streamable HTTP, **stateless**. Tiap request membuat McpServer + `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` baru.
- Saat MCP mati: `/mcp` → **404** `{ error: "MCP nonaktif. Nyalakan di Pengaturan." }`. Perubahan setelan berlaku tanpa restart.
- Proteksi DNS-rebinding: header `Host` harus `127.0.0.1:<port>` atau `localhost:<port>`, selain itu 403. Header `Origin`, jika ada, harus lokal (sama dengan guard yang sudah ada).
- Nama server MCP `storyboard-maker`, versi dari package.json.
- Semua tool memakai fungsi `src/shared/model.ts` yang sama dengan editor, dan tiap perubahan divalidasi `parseProject` sebelum ditulis.

### 3.1 Tool

Semua id adalah id yang dikembalikan `get_project`. Satuan posisi/ukuran = panel space (1080×1920, atau 1080×960 bila scene split). Error dikembalikan sebagai hasil tool dengan `isError: true` dan pesan Indonesia yang jelas, misalnya "Page sudah berisi 3 scene".

| Tool | Input | Hasil (`structuredContent`) |
|---|---|---|
| `list_projects` | `{ q?, status?: active\|archived\|all }` | `{ items: ProjectSummary[] }` (maks 100) |
| `create_project` | `{ name }` | `{ slug }` |
| `get_project` | `{ slug }` | ringkasan: `{ slug, name, cover: {id,title,panelId}\|null, pages: [{ id, index, background, scenes: [{ id, number, note, subtitle, split, panels: [{ id, background, layers: [{id,type,...ringkas}] }] }] }] }` |
| `get_storyline` / `set_storyline` | `{ slug }` / `{ slug, text }` | `{ text }` / `{ ok }` |
| `list_assets` | `{ slug }` | `{ project: AssetInfo[], global: AssetInfo[] }` (`ref`, `name`, `width`, `height`) |

Total 19 tool.
| `add_page` | `{ slug, afterPageId?, scenes?: 1..3 }` | `{ pageId, sceneIds }` |
| `add_scene` | `{ slug, pageId, afterSceneId? }` | `{ sceneId, number }` |
| `remove_scene` / `remove_page` | `{ slug, sceneId }` / `{ slug, pageId }` | `{ ok }` (aturan V2: minimal 1 scene per page, minimal 1 page) |
| `update_scene` | `{ slug, sceneId, note?, subtitle?, split? }` | `{ ok }` |
| `set_cover` | `{ slug, enabled, title? }` | `{ coverPanelId \| null }` |
| `set_background` | `{ slug, target: { pageId } \| { panelId } \| "default", color? , assetRef?, fit?: cover\|contain }`, tepat satu dari color/assetRef; `{ pageId }` + `reset: true` kembali ke default | `{ ok }` |
| `add_layer` | `{ slug, panelId, layer }`. `layer` salah satu dari: `{type:"image", assetRef, x?, y?, width?}` · `{type:"text", text, x?, y?, font?, fontSize?, fill?, stroke?, strokeWidth?}` · `{type:"shape", shape: ShapeKind, x?, y?, width?, height?, fill?, stroke?, strokeWidth?, dash?}` · `{type:"emoji", char, x?, y?, size?}`; semua boleh `rotation?`, `opacity?` 0–100 | `{ layerId }` |
| `update_layer` | `{ slug, panelId, layerId, patch }` (field sama dengan add_layer minus `type`) | `{ ok }` |
| `remove_layer` | `{ slug, panelId, layerId }` | `{ ok }` |
| `reorder_layer` | `{ slug, panelId, layerId, to: up\|down\|top\|bottom }` | `{ ok }` |
| `export_pdf` | `{ slug }` | `{ path, url, missingAssets, missingFonts }` |
| `finish_editing` | `{ slug }` | `{ ok }`: melepas kunci agent (§4) |

Default posisi = tengah panel. Default ukuran image = 60% lebar panel (sama dengan paste). Default teks/shape/emoji sama dengan tombol toolbar.

**Agent tidak bisa** menghapus, mengarsipkan, mengganti nama, atau menduplikat project, dan tidak bisa meng-upload file.

## 4. Live + kunci agent

- Setiap tool yang mengubah project (semua kecuali `list_*`, `get_*`, `export_pdf`, `finish_editing`) memegang **kunci agent** project tersebut.
- Kunci dilepas lewat `finish_editing`, atau otomatis **10 detik** setelah tool terakhir.
- Mulai kunci (pertama kali, atau setelah kunci lepas):
  1. Server mengirim event `agent` `{ active: true }` ke editor yang membuka project itu.
  2. Editor segera menyimpan perubahan yang belum tersimpan (flush), lalu `POST /api/projects/:slug/agent-ack`.
  3. Server menunggu ack dari semua editor yang terhubung, maksimal **3 detik**, baru menjalankan tool.
- Selama kunci aktif:
  - `PUT /api/projects/:slug`, `PUT …/storyline`, `DELETE`, `/archive`, `/rename`, dan bulk untuk slug itu → **423** `{ error: "AI sedang mengedit project ini" }`.
  - Upload asset dari editor tetap boleh, karena tidak mengubah project.json.
- Perubahan project oleh server dikirim ke editor sebagai event `project` (project lengkap). Perubahan storyline dikirim sebagai event `storyline` `{ text }`.
- Penulisan project.json di server diserialkan per slug: PUT editor dan tool agent tidak pernah saling timpa.
- Event dikirim lewat SSE `GET /api/projects/:slug/events`:
  - Data JSON per baris `data:`, jenis di field `type`: `hello` | `agent` | `project` | `storyline`.
  - `hello` dikirim saat tersambung: `{ type:"hello", agent: { active, since } }`.
  - Keep-alive komentar tiap 15 detik.

### Editor saat agent aktif

- Badge di toolbar: **● AI sedang bekerja…** (titik berdenyut), plus waktu mulai.
- Semua aksi edit ditolak: canvas tidak bisa di-drag/transform, input panel kanan dan storyline disabled, shortcut edit (Ctrl+Z/Y/C/X/V, Delete, +Scene, +Page, drop asset, paste gambar) diabaikan.
- Masih boleh: pindah slide/scene, zoom, lipat panel, export PDF, dan kembali ke Home.
- Setiap event `project` masuk ke riwayat undo sebagai satu langkah. Status simpan = "tersimpan", dan tidak memicu autosave. Setelah agent selesai, Ctrl+Z membatalkan perubahan agent satu per satu, dan hasil undo disimpan seperti edit biasa.
- Seleksi dijaga (`fixSelection`). Jika scene/layer yang dipilih dihapus agent, pilihan pindah ke yang terdekat.
- Saat kunci lepas: badge hilang, toast info "AI selesai mengedit".
- SSE putus → reconnect otomatis (EventSource). Saat tersambung lagi, editor menerima `hello`. Jika `agent.active` false tapi editor masih terkunci, kunci dibuka.

### Home

- Kartu atau baris project yang sedang dikunci agent menampilkan badge **AI** (dari field `agentActive` di `ProjectSummary`).

## 5. Mode gelap

- Tombol di header Home dan toolbar editor: ☾ / ☀ untuk beralih Terang ↔ Gelap. Pilihan "Ikuti sistem" ada di Pengaturan.
- Atribut `data-theme="light|dark"` di `<html>` diterapkan **sebelum render pertama** lewat script inline di `index.html`, sehingga tidak ada kedipan putih.
  - Mode `system` mengikuti `prefers-color-scheme` dan ikut berubah live.
- Semua warna UI memakai CSS variable. Tidak boleh ada warna hex/rgb UI langsung di komponen; warna konten storyboard boleh.
- Variabel minimum: `--bg --panel --panel-2 --line --line-strong --text --muted --accent --accent-soft --danger --danger-soft --hover --shadow`.
- Palet gelap compact dan netral (tanpa glow/gradient):
  - `--bg #17181a`, `--panel #1f2023`, `--panel-2 #26272b`
  - `--line #34353a`, `--line-strong #45464c`
  - `--text #e6e6e3`, `--muted #9a9a95`
  - `--accent #6b9bff`, `--accent-soft #22304d`, `--danger #ef6a5a`
- **Isi storyboard tidak berubah**: page, frame, teks di canvas, thumbnail, dan PDF tetap warna aslinya. Route `/print` selalu terang.
- Kontras teks UI ≥ 4.5:1 terhadap `--panel` di kedua tema.
