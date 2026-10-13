# Storyboard Maker — SPEC V2 (revisi 1)

Status: Draft, perlu review user
Tanggal: 2026-10-13
Berlaku di atas `docs/SPEC.md` (v1). Bagian yang tidak disebut di sini tetap mengikuti v1.

## 1. Latar

Setelah mencoba v1, user menemukan 7 kekurangan: toast tidak hilang sendiri, sidebar tidak bisa dilipat, shape hanya panah, page dipaksa terisi 3 scene, pilihan font sedikit, tidak ada Ctrl+C/V, dan tidak ada tampilan per page yang bisa diedit. Revisi ini mengubah editor menjadi gaya PowerPoint: slide = page, isi slide = 1–3 scene.

## 2. Keputusan

### Disepakati (di chat)

| # | Keputusan |
|---|---|
| V1 | Toast hilang otomatis. |
| V2 | Sidebar kiri dan kanan bisa dibuka-tutup. |
| V3 | Shape lengkap: kotak, kotak tumpul, elips, garis, panah, panah dua arah, target berlapis, silang ✕, bintang, balon kata. Pengaturan: isi/tanpa isi, warna & tebal garis, putus-putus, opacity. |
| V4 | Page seperti slide PPT: "+ Page" dibuat user; "+ Scene" menambah scene di page aktif, min 1 maks 3. Tidak ada reflow otomatis antar page. Nomor scene tetap berlanjut. |
| V5 | Page khusus **Cover** opsional di awal: judul (default "VISUAL ASLI") + satu frame 9:16 di tengah, bisa diedit seperti scene, tidak dihitung sebagai scene. |
| V6 | Font: paket bawaan ±15 font (offline) + font laptop via Chrome (`queryLocalFonts`) bila tersedia. |
| V7 | Ctrl+C / Ctrl+V layer antar scene + paste gambar dari clipboard sistem → otomatis jadi asset project. |
| V8 | Layout editor seperti PPT: Slides \| Storyline/Asset \| Page aktif \| Properti. Page aktif tampil seperti PDF dan frame-nya bisa diedit langsung. |
| V9 | Di tampilan page, catatan & subtitle hanya tampilan; editnya lewat panel kanan. |
| V10 | Tampilan page memakai ulang komponen PDF (PageSheet) supaya editor = PDF. |

### Diusulkan (belum dibahas — tolong cek)

| # | Usulan |
|---|---|
| W1 | Durasi toast: sukses/info 4 dtk, peringatan 8 dtk, error tetap sampai ditutup ×. Toast menumpuk, maksimal 4 terlihat. |
| W2 | Shortcut panel: Ctrl+1 Slides, Ctrl+2 Storyline/Asset, Ctrl+3 Properti. Status buka-tutup disimpan di localStorage. |
| W3 | Zoom satu scene: double-click frame atau tombol **Z**; Esc kembali ke page. |
| W4 | "+ Page" menyisipkan page tepat setelah page aktif, berisi 1 scene kosong, background ikut default project. |
| W5 | Hapus page meminta konfirmasi bila ada isi; page terakhir tidak bisa dihapus. Hapus scene terakhir di page = tidak diizinkan (tombol nonaktif); pakai hapus page. |
| W6 | Menu slide (⋯): Duplikat page, Hapus page, Naik, Turun. Drag-reorder slide memakai HTML5 drag & drop. |
| W7 | Ctrl+V layer ke scene yang sama → digeser +40,+40; ke scene lain → posisi sama. Ctrl+X = potong. Clipboard layer disimpan di memori aplikasi (bukan clipboard sistem), clipboard sistem dipakai hanya untuk gambar. |
| W8 | Gambar paste disimpan sebagai `paste-YYYYMMDD-HHMMSS.png`. |
| W9 | Daftar font bawaan: Coming Soon, Bangers, Inter, Poppins, Montserrat, Bebas Neue, Anton, Permanent Marker, Luckiest Guy, Fredoka, Patrick Hand, Oswald, Roboto Slab, Caveat, Lilita One. |
| W10 | Export melaporkan `missingFonts` (font di project yang tidak termuat), tampil sebagai toast peringatan. |
| W11 | Project v1 dikonversi otomatis ke v2 saat dibaca (server), disimpan sebagai v2 pada simpan berikutnya. |
| W12 | Thumbnail slide dirender dengan PageSheet skala kecil (pixelRatio 1). |

## 3. Model data v2

Perubahan terhadap v1 §4:

```ts
interface Project { version: 2; ...; cover: Cover | null; pages: Page[] }
interface Cover { id: string; title: string; panel: Panel }    // panel ruang 1080x1920, tak pernah split

type FontName = string;                 // dulu union 3 nama
interface TextLayer { ...; font: string }

type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'line' | 'arrow' | 'doubleArrow' | 'target' | 'cross' | 'star' | 'bubble';
interface ShapeLayer extends LayerBase {
  type: 'shape'; shape: ShapeKind;
  width: number; height: number;        // kotak pembatas, x,y = pusat
  fill: string | null; stroke: string | null; strokeWidth: number; dash: boolean;
}
type Layer = ImageLayer | TextLayer | ArrowLayer | EmojiLayer | ShapeLayer;   // ArrowLayer lama tetap valid
```

Aturan page: `scenes.length` 1..3 (sama dengan v1). Bedanya ada pada operasi: tidak ada lagi reflow otomatis.

Migrasi v1 → v2: `version: 2`, `cover: null`, sisanya tetap.

## 4. Layout PDF tambahan — Cover

| Elemen | Nilai (pt) |
|---|---|
| Judul cover | teks `cover.title`, tengah, y 23, 30pt, Coming Soon |
| Frame | 144 × 256 di tengah: x 282.375, y 128, border brush |
| Tanpa | label scene, catatan, subtitle, garis brush |

Cover selalu halaman PDF pertama bila ada.

## 5. Editor

```
┌ Toolbar: ← | nama | Undo Redo | T Teks  ◇ Shape  😀 Emoji | status | Preview | Export ┐
├────────┬──────────────┬──────────────────────────────────────┬──────────────┤
│ Slides │ [Story][Aset]│          Page aktif (PageSheet)       │ Properti     │
│ ▢ Cover│              │   STORYBOARD                          │ Scene N      │
│ ▢ P1   │              │  Scene 1   Scene 2   Scene 3          │ catatan      │
│ ▢ P2 ⋯ │              │  [frame]   [frame]   [frame]          │ subtitle     │
│        │              │                                       │ layer/shape  │
│ +Page  │              │ [+ Scene][Duplikat][Hapus][←][→][Zoom]│ font …       │
└──«─────┴──────«───────┴───────────────────────────────────────┴─────»────────┘
```

- Scene aktif ditandai garis biru 2px di sekitar frame.
- Klik frame = pilih scene (+ layer di bawah kursor). Drop asset ke frame mana pun = layer di scene itu.
- Zoom (W3) memakai tampilan per-scene lama (SceneCanvas besar).
- Cover dipilih dari Slides; tampil sebagai PageSheet cover; panel kanan menampilkan judul cover + background + layer.
- Shape: menu 10 jenis; default di tengah panel, 400×400 (garis/panah: 500×0), isi null, garis `#000000` tebal 12, kecuali `target` (isi null, garis `#E53935`), `bubble` (isi `#FFFFFF`).
- Font picker: input cari, daftar dengan pratinjau, grup "Bawaan" dan "Laptop", tombol "Muat font laptop" (hanya muncul jika `window.queryLocalFonts` ada).

## 6. Error handling tambahan

- `queryLocalFonts` ditolak/tidak ada → grup Laptop tidak tampil, tanpa error.
- Paste gambar gagal upload → toast error.
- Font text layer tidak tersedia → canvas memakai fallback; export melaporkan `missingFonts`.

## 7. Testing tambahan

- Unit: operasi page (add/remove/duplicate/move page, add scene di page penuh ditolak), cover, migrasi v1→v2, shape default, clipboard paste offset, toast timer.
- Export: PDF dengan cover → halaman 1 berisi judul cover dan tanpa "Scene"; Scene 1 di halaman 2; page dengan 1 scene → frame di tengah.
- E2E: + Page, + Scene sampai 3 (tombol nonaktif), copy-paste layer antar scene, lipat sidebar.

## 8. Revisi 2 (2026-10-13, masukan user setelah mencoba V2)

| # | Perubahan |
|---|---|
| R1 | Font picker: menu dirender di portal `position: fixed`, ditempatkan agar selalu di dalam viewport (geser kiri / flip ke atas); baris tinggi tetap 30px, nama terpotong `…` — tidak ada lagi menu terpotong / baris tumpang tindih. |
| R2 | Footer zoom page gaya Word: tombol Pas, −, slider 25–400%, +, persen (klik = 100%). 100% = ukuran asli page (708.75pt). Ctrl+= / Ctrl+- / Ctrl+0 dan Ctrl+scroll. Saat zoom > layar, area page bisa di-scroll. |
| R3 | Opacity (transparansi) 0–100% untuk semua layer (teks, gambar, shape, emoji) lewat slider + angka di panel Properti. |
| R4 | Frame scene diperbesar: 198×352pt (dulu 144×256), 3 kolom tetap muat, margin kiri-kanan simetris 27.375pt, jarak antar frame 30pt. Layout vertikal: label y70, catatan y84, frame y102–454, subtitle y462 (maks 4 baris), garis brush y530. Lebar catatan/subtitle = lebar frame. Cover ikut frame baru. |
| R5 | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y bekerja juga saat fokus di kolom catatan, subtitle, dan properti (undo aplikasi). Kolom storyline dan kolom cari tetap memakai undo bawaan browser. |
