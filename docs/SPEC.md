# Storyboard Maker — SPEC

Status: Draft, perlu review user
Tanggal: 2026-10-12

## 1. Tujuan

Aplikasi web lokal untuk membuat storyboard video pendek 9:16 dari storyline, menggantikan template Canva yang sekarang dibuat manual / oleh agent. Output akhir: PDF yang dikirim ke video editor (orang lain) untuk dieksekusi.

Sampel acuan: `~/Videos/Konten/Nah Jadi/selimut darurat/` dan `~/Videos/Konten/Nah Jadi/kenapa pakai tikus percobaan/` (storyline `.docx`, `storyboard.pdf`, folder `img/`).

Di luar scope v1: agentic mode (OpenAI-compatible custom URL), animasi, tint/blur/masking, halaman "VISUAL ASLI", multi-user/server.

## 2. Keputusan

### Disepakati (di chat)

| # | Keputusan |
|---|---|
| D1 | Output akhir: export PDF mirip template Canva, untuk video editor. |
| D2 | Storyline dipecah ke scene secara MANUAL. Ada panel Storyline Viewer di samping editor supaya bisa copy-paste tanpa buka aplikasi lain. |
| D3 | Asset dua tingkat: per project + global. Keduanya tampil di panel asset. |
| D4 | Alur: New Project → multi page → tiap page 1–3 scene. Scene dimulai dari tengah, nomor scene berlanjut lintas page. |
| D5 | Per kolom scene: "Scene N" → catatan efek (atas) → frame 9:16 → subtitle/narasi (bawah). |
| D6 | Page punya background (warna / asset), scene/panel juga punya background (warna / asset); keduanya bisa diganti. |
| D7 | Asset di-drag & drop ke scene. |
| D8 | Jalan lokal, data berupa folder di disk. |
| D9 | Stack: Vite + React + Konva, server Node kecil (Hono), export PDF via Chromium (Playwright). pnpm. |
| D10 | Model data: Project → Page → Scene → Panel → Layer (lihat §4). |

### Diusulkan (belum dibahas — tolong cek)

| # | Usulan |
|---|---|
| U1 | Split frame atas-bawah (2 panel per scene) opsional per scene, default 1 panel. |
| U2 | Tool v1: image layer (geser/resize/rotate/flip/opacity/urutan layer), text, panah, emoji, duplikat scene. Tint/blur/masking ditunda. |
| U3 | Posisi scene dalam page: 1 scene = tengah, 2 scene = simetris di tengah, 3 scene = penuh. Berlaku di editor dan PDF. |
| U4 | Repo di `~/Documents/Repos/NodeJS/storyboard-maker`, data di `~/Storyboard` (override env `STORYBOARD_HOME`). |
| U5 | Font: Coming Soon untuk label/catatan/subtitle (sama dengan PDF Canva sampel), judul "STORYBOARD" juga Coming Soon. Text layer: Coming Soon, Bangers, Inter. Semua di-bundle via @fontsource (offline). |
| U6 | Layout editor (§6): kiri tab Storyline/Asset, tengah canvas scene besar + strip page, kanan properti. |
| U7 | GIF tampil sebagai frame pertama (statis) di editor dan PDF. |
| U8 | Autosave 1,5 detik setelah perubahan terakhir; undo/redo 100 langkah per sesi. |
| U9 | Tambah scene saat page penuh (3) → page baru disisipkan tepat setelah page aktif. Hapus scene terakhir di page → page ikut terhapus (kecuali satu-satunya page). |
| U10 | File asset dengan nama sama saat upload → disimpan dengan akhiran ` (2)`, ` (3)`, … (tidak menimpa). |

## 3. Penyimpanan

```
~/Storyboard/
  library/                      asset global
  projects/<slug>/
    project.json
    storyline.txt
    assets/
    exports/storyboard.pdf
```

- `slug` dari nama project: lowercase, spasi → `-`, hanya `[a-z0-9-]`; bentrok → `-2`, `-3`.
- Nama file asset dipertahankan apa adanya (boleh spasi, mis. `dont .png`), ditolak bila mengandung `/`, `\`, `..`, atau diawali `.`.
- Tulis `project.json` atomik (tulis `.tmp` lalu rename).
- Format asset diterima: png, jpg/jpeg, gif, webp.

## 4. Model data (`project.json`)

```ts
type AssetRef = `global:${string}` | `project:${string}`;
type Background = { kind: 'color'; color: string } | { kind: 'asset'; ref: AssetRef; fit: 'cover' | 'contain' };

interface Project { version: 1; name: string; createdAt: string; updatedAt: string;
  pageBackground: Background;            // default { color '#D4BFB3' }
  pages: Page[] }
interface Page { id: string; background: Background | null; scenes: Scene[] }  // 1..3 scene; null = ikut project
interface Scene { id: string; note: string; subtitle: string; split: boolean; panels: Panel[] } // panels.length === (split ? 2 : 1)
interface Panel { id: string; background: Background; layers: Layer[] }   // default { color '#FFFFFF' }; layers[0] paling belakang

type Layer = ImageLayer | TextLayer | ArrowLayer | EmojiLayer;
interface Base { id: string; x: number; y: number; rotation: number; opacity: number }  // x,y = titik tengah
interface ImageLayer extends Base { type: 'image'; ref: AssetRef; width: number; height: number; flipX: boolean; flipY: boolean }
interface TextLayer  extends Base { type: 'text'; text: string; font: 'Coming Soon' | 'Bangers' | 'Inter'; fontSize: number; fill: string; stroke: string | null; strokeWidth: number }
interface ArrowLayer extends Base { type: 'arrow'; points: [number, number, number, number]; strokeWidth: number; color: string }  // points relatif ke x,y
interface EmojiLayer extends Base { type: 'emoji'; char: string; size: number }
```

- Koordinat layer dalam ruang frame **1080×1920** per panel. Saat `split`, panel ruangnya 1080×960 (setengah tinggi).
- Nomor scene TIDAK disimpan; dihitung dari urutan.
- Animasi kelak = field opsional `animation` di Layer (tidak dibuat sekarang).

## 5. Layout halaman PDF (dari pengukuran sampel Canva)

Satuan pt, page **708.75 × 567** (landscape).

| Elemen | Nilai |
|---|---|
| Judul "STORYBOARD" | tengah, baseline area y 23–57, 30pt |
| Lebar kolom / frame | frame 144 × 256 (9:16) |
| Jarak antar kolom (pitch) | 228 |
| Posisi x kolom (3 scene) | 35, 263, 491 |
| Posisi x (2 scene) | 168.375, 396.375 (frame di tengah page, U3) |
| Posisi x (1 scene) | 282.375 (frame tepat di tengah page) |
| "Scene N" | y 94, 12pt |
| Catatan efek | y 109, 7pt (mengecil s/d 5pt), max 2 baris, lebar 165; kosong → tampil `-` |
| Frame | y 128, border brush hitam |
| Subtitle | y 390, 11pt, lebar 165, max 4 baris; lebih panjang → font turun sampai 8pt lalu terpotong `…` |
| Garis brush | y 470, lebar 150 |
| Split | frame dibagi 2 panel 144×128 dengan garis pemisah hitam |

Konstanta ini di satu file (`shared/layout.ts`) supaya mudah dikalibrasi.

PDF: teks (judul, label, catatan, subtitle) tetap teks asli (bisa dipilih/dicari). Isi frame dirender Konva ke canvas pixelRatio 4.

## 6. Editor

```
┌ Toolbar: ← Projects | nama project | Undo Redo | status simpan | Preview Page | Export PDF ┐
├──────────────┬───────────────────────────────────────────┬──────────────────┤
│ [Storyline]  │  Page strip: [P1: 1 2 3][P2: 4 5 6][P3: 7] + │ Scene 5          │
│ [Asset]      │                                           │  Catatan efek [] │
│              │        ┌───────────┐                      │  Subtitle    []  │
│ teks storyline│        │  canvas   │  tool: T → 😀 bg     │  Split [ ]       │
│ (bisa diblok, │        │  scene    │                      │  Background ...  │
│  copy)        │        │  9:16     │                      │ Layer terpilih   │
│              │        └───────────┘                      │  props, urutan   │
│ Asset: tab   │  [+ Scene] [Duplikat] [Hapus] [← →]       │ Daftar layer     │
│ Project/Global│                                           │ Page background  │
└──────────────┴───────────────────────────────────────────┴──────────────────┘
```

- Storyline: paste teks atau import `.docx`; disimpan ke `storyline.txt`; bisa diedit.
- Asset: grid thumbnail, filter nama; upload dengan drag file dari file manager atau tombol; drag thumbnail ke canvas → image layer di titik drop, lebar 60% frame, rasio asli.
- Klik kanan / tombol pada thumbnail asset → "Jadikan background scene" / "Jadikan background page".
- Canvas: pilih layer, Transformer (resize, rotate), Delete, Ctrl+D duplikat layer, Ctrl+Z / Ctrl+Shift+Z, `[` `]` urutan layer.
- Preview Page: tampilan page persis seperti PDF.
- Gaya UI: compact, border 1px, tanpa gradient/glow/kartu bulat besar.

## 7. API server (127.0.0.1:5178)

| Method | Path | Hasil |
|---|---|---|
| GET | `/api/projects` | `{slug,name,updatedAt}[]` urut terbaru |
| POST | `/api/projects` `{name}` | `{slug}` (project baru berisi 1 page, 1 scene) |
| GET | `/api/projects/:slug` | `Project` |
| PUT | `/api/projects/:slug` body `Project` | `{updatedAt}`; body tidak valid → 400 |
| GET/PUT | `/api/projects/:slug/storyline` | `{text}` |
| POST | `/api/projects/:slug/storyline/import` multipart `file` (.docx) | `{text}` (juga disimpan) |
| GET | `/api/assets?project=:slug` | `{project: AssetInfo[], global: AssetInfo[]}` |
| POST | `/api/assets/global`, `/api/assets/project/:slug` multipart `files[]` | `AssetInfo[]` |
| GET | `/files/global/:name`, `/files/project/:slug/:name` | file |
| POST | `/api/projects/:slug/export` | `{path, missingAssets: string[]}`, PDF di `exports/storyboard.pdf` |
| GET | `/api/projects/:slug/export.pdf` | unduh PDF terakhir |

`AssetInfo = { ref: AssetRef; name: string; width: number; height: number; url: string }`.
Slug/nama tidak valid → 400; tidak ada → 404. Server hanya bind ke 127.0.0.1.

## 8. Error handling

- Asset hilang: frame menggambar kotak abu-abu bergaris dengan nama file; export tetap jalan dan mengembalikan `missingAssets`; UI menampilkan peringatan.
- Autosave gagal: status "Gagal simpan — coba lagi", retry tiap 5 detik, data tetap di memori.
- Export: timeout 120 detik; error ditampilkan di toast.

## 9. Testing

- Unit (Vitest): model ops, numbering, layout, validasi schema, path safety.
- API (Vitest + `app.request`) dengan `STORYBOARD_HOME` folder tmp.
- E2E (Playwright): buat project, 4 scene → 2 page; export PDF → `pdftotext` berisi "Scene 4" di halaman 2, jumlah halaman 2.
