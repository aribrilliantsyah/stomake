<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/stomake-lockup-dark.svg">
  <img src="docs/images/stomake-lockup.svg" alt="Stomake" width="480">
</picture>

<p align="center">
  <strong>Bahasa Indonesia</strong> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <strong>Bikin storyboard video vertikal 9:16 dari naskah, lalu export PDF siap kirim ke video editor. Jalan lokal di laptop, sebagai aplikasi desktop atau di browser.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Playwright-1.x-45BA4B?logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/MCP-25_tools-AE4F2C" alt="Model Context Protocol">
  <a href="https://github.com/aribrilliantsyah/stomek/releases/latest"><img src="https://img.shields.io/github/v/release/aribrilliantsyah/stomek?label=download" alt="Rilis terbaru"></a>
</p>

</div>

---

## ⬇️ Download

Installer siap pakai ada di halaman **[Releases](https://github.com/aribrilliantsyah/stomek/releases/latest)**, lengkap dengan changelog tiap versi.

| OS | File |
|---|---|
| Windows 10/11 | `Stomake_<versi>_x64-setup.exe` (atau `.msi`) |
| Linux x64 | `Stomake_<versi>_amd64.AppImage` |

- **Windows**: jalankan installer. Installer belum ditandatangani, jadi bila SmartScreen muncul pilih *More info → Run anyway*.
- **Linux**: `chmod +x Stomake_*.AppImage`, lalu jalankan file tersebut. Tidak perlu sudo.

Node, server, dan Playwright sudah ikut di dalam aplikasi. Export PDF memakai Chrome/Edge yang sudah ada di laptop; bila tidak ada, Chromium headless diunduh sekali saat export pertama.

---

## 📸 Antarmuka Aplikasi

Semua contoh editor di bawah memakai storyboard contoh *"Kenapa Es Batu Mengapung?"* dengan ilustrasi yang dibuat khusus untuk dokumentasi ini.

### Editor
Kiri ke kanan: daftar slide (page), naskah storyline, page aktif yang tampil persis seperti PDF, dan properti scene serta layer. Di sini Scene 2 memakai split atas-bawah, dan layer teks "BENDA LAIN" sedang dipilih.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/editor-dark.png">
  <img src="docs/images/editor-light.png" alt="Editor storyboard: slides, storyline, page dengan 3 scene, panel properti">
</picture>

### Asset dan zoom scene

| Tab Asset: tarik gambar ke frame scene | Zoom satu scene (`Z`), shape bintang dipilih |
|---|---|
| ![Tab Asset dengan gambar project](docs/images/editor-assets-light.png) | ![Scene diperbesar dengan shape terpilih](docs/images/scene-editor-detail.png) |

### Cover dan Pengaturan

| Cover "VISUAL ASLI" (opsional, tidak dihitung sebagai scene) | Pengaturan: tema, folder penyimpanan, MCP |
|---|---|
| ![Halaman cover](docs/images/cover-slide.png) | ![Dialog Pengaturan](docs/images/settings-modal.png) |

### Home
Daftar project dengan pencarian, filter Aktif/Arsip, urutan, tampilan grid atau list, serta Import project dari `.zip`.

| Terang | Gelap |
|---|---|
| ![Home tema terang](docs/images/dashboard-light.png) | ![Home tema gelap](docs/images/dashboard-dark.png) |

---

## ✨ Fitur Utama

- **Aplikasi desktop (Tauri)**: jendela native untuk Windows dan Linux (macOS bisa dibuild manual), tanpa perlu memasang Node. Versi browser tetap tersedia lewat `pnpm start`.
- **Slide gaya PowerPoint**: tiap page berisi 1–3 scene, ditambah Cover *"VISUAL ASLI"* opsional. Nomor scene berlanjut antar page; tidak ada pemindahan scene otomatis.
- **Frame 9:16 vertikal**: untuk TikTok, Reels, dan Shorts. Tiap scene punya catatan efek di atas, frame di tengah, dan subtitle di bawah. Frame bisa dibagi atas-bawah untuk kondisi awal → akhir.
- **Storyline di samping**: tempel naskah atau import `.docx`, lengkap dengan hitungan kata, lalu salin ke subtitle scene.
- **Asset per project dan global**: upload dengan drag file atau tombol, tarik thumbnail ke frame, atau tempel screenshot dari clipboard.
- **Layer**: gambar (PNG/JPG/GIF/WebP), teks (15 font bawaan + font laptop, satu baris atau kotak lipat multi-baris dengan rata kiri/tengah/kanan dan jarak baris), 12 shape (kotak, elips, garis, panah, target, silang, bintang, balon kata, panah putar), dan emoji. Geser, ubah ukuran, putar, flip, opacity, grup, serta urutkan dengan drag di daftar layer. Lebar/Tinggi gambar punya tombol kunci rasio (aktif bawaan): ubah satu, yang lain menyesuaikan.
- **Folder penyimpanan bebas**: pilih sendiri lokasinya, misalnya `Documents`. Folder project yang di-copy ke sana langsung terbaca.
- **Export / Import `.zip`**: pindahkan project antar laptop atau OS, termasuk gambar yang dipakai.
- **Autosave, undo/redo, zoom 25–400%**.
- **Export PDF**: dirender Chromium, teks tetap bisa dipilih dan dicari.
- **MCP untuk AI agent**: 25 tool agar Claude Code, Cursor, atau Hermes bisa menyusun storyboard — teks sebagai layer asli, background bermotif yang dibuat sendiri, ilustrasi SVG, dan pemeriksaan kualitas sebelum selesai. Editor terkunci dan menampilkan perubahan secara live selama agent bekerja.

---

## 🚀 Memulai

### Prasyarat
- **Node.js** 22 atau lebih baru
- **pnpm** 10
- Untuk export PDF: Google Chrome, Chromium, atau Edge yang sudah terpasang. Bila tidak ada, jalankan `pnpm exec playwright install chromium`.

### Instalasi & Menjalankan

```bash
# Clone repository
git clone https://github.com/aribrilliantsyah/stomek.git
cd stomek

# Install dependensi
pnpm install

# Jalankan server aplikasi
pnpm start
```

Buka **`http://127.0.0.1:5178`** di browser.

### Aplikasi Desktop (Tauri)

Aplikasi desktop membungkus web app yang sama dalam jendela native. Installer membawa Node, server, dan Playwright sendiri, jadi pengguna tidak perlu memasang apa pun.

Prasyarat build: [Rust](https://rustup.rs) dan [prasyarat Tauri](https://v2.tauri.app/start/prerequisites/) untuk OS tersebut (Linux: `webkit2gtk-4.1`).

```bash
pnpm desktop:dev     # jendela desktop dengan build lokal
pnpm desktop:build   # installer di src-tauri/target/release/bundle/
```

Installer dibuat per OS, tidak bisa cross-build: jalankan `pnpm desktop:build` di Windows untuk `.exe`/`.msi`, di Linux untuk `.deb`/`.rpm`/`.AppImage`, di macOS untuk `.dmg`. Binary Node yang ikut dibundel diambil dari Node yang menjalankan build. Rilis resmi dibuat otomatis oleh GitHub Actions (lihat bagian **Rilis versi baru** di bawah).

Drag file gambar dari file manager ke tab **Asset** untuk upload ke Project atau Global. Untuk screenshot/gambar dari aplikasi lain, pilih scene lalu tekan **Ctrl+V** (**Cmd+V** di macOS); gambar disimpan sebagai clip scene, bukan langsung ke library Asset. Paste teks di input/textarea tetap memakai clipboard sistem.

Engine webview berbeda per OS: Linux memakai WebKitGTK, Windows WebView2, dan macOS WKWebView. Di Linux, file drop dari luar aplikasi ditangani lewat GTK; drag thumbnail/layer/slide di dalam editor tetap memakai HTML5. Clipboard gambar memakai fallback native ketika webview tidak menyediakan file pada event paste.

Setelah mengubah integrasi native atau dependensinya, jalankan ulang `pnpm desktop:dev` atau rebuild dengan `pnpm desktop:build`; aplikasi yang sudah terpasang tidak otomatis memakai kode terbaru.

---

## 📂 Struktur Penyimpanan Data

Seluruh data proyek dan aset disimpan secara lokal di **folder penyimpanan**. Default `~/Storyboard` (Windows: `C:\Users\<nama>\Storyboard`). Ganti lewat ⚙ **Pengaturan → Folder penyimpanan → Ganti folder…** (misalnya ke `Documents` atau folder yang disinkron cloud). Pilihan disimpan per OS di folder konfigurasi aplikasi (`%APPDATA%\stomake`, `~/Library/Application Support/stomake`, atau `~/.config/stomake`); pilihan dari versi lama (folder `storyboard-maker`) tetap terbaca. Data di folder lama tidak dipindah. Variabel environment `STORYBOARD_HOME`, bila diisi, selalu menang atas pilihan ini.

```text
~/Storyboard/
├── library/                           # Aset global perpustakaan
├── settings.json                      # Pengaturan global & konfigurasi MCP
├── logs/mcp.jsonl                     # Log panggilan MCP
└── projects/
    └── <slug-proyek>/
        ├── project.json               # Struktur data storyboard & layer
        ├── storyline.txt              # Naskah cerita proyek
        ├── assets/                    # File aset gambar proyek
        ├── clips/                     # Gambar clipboard sementara
        └── exports/
            └── storyboard.pdf         # Hasil export PDF
```

- **Copy folder**: salin folder `projects/<slug>/` ke `projects/` di folder penyimpanan lain, dan project langsung muncul di Home. Nama folder harus huruf kecil, angka, dan `-`.
- **Export / Import .zip**: menu ⋯ project → **Export (.zip)…**, lalu di laptop lain klik **Import** di Home. Zip berisi `project.json`, storyline, `assets/`, dan `clips/`. Asset global (library) yang dipakai project ikut disalin ke `assets/` agar tidak hilang di laptop lain. Import tidak pernah menimpa project yang sudah ada; slug bentrok diberi akhiran `-2`.

---

## ⌨️ Pintasan Keyboard (Shortcuts)

| Tombol | Fungsi |
|---|---|
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo aksi |
| `Ctrl + Shift + Z` | Alternatif Redo |
| `Ctrl + =` / `Ctrl + -` | Perbesar / Perkecil kanvas (Zoom in / out) |
| `Ctrl + 0` | Sesuaikan ukuran kanvas ke layar (Fit to screen) |
| `Delete` / `Backspace` | Hapus layer yang sedang dipilih |
| `Ctrl + D` | Duplikat layer terpilih |
| `Ctrl + A` | Pilih semua layer di panel aktif |
| `Shift` / `Ctrl` + klik, atau tarik kotak di area kosong | Pilih beberapa layer |
| `Ctrl + G` / `Ctrl + Shift + G` | Grup / pisahkan grup layer |
| `]` / `[` | Naikkan / turunkan urutan layer (`Shift` = paling depan/belakang) |
| `Panah (Arrow keys)` | Geser posisi layer 5px (`Shift` = 50px) |
| `Ctrl + C` / `Ctrl + V` | Salin dan tempel layer antar scene |
| `Ctrl + X` | Potong (cut) layer |
| `Z` / Double-click frame | Zoom fokus ke satu scene tertentu |
| `Esc` | Batalkan seleksi / keluar dari mode zoom |
| `Ctrl + 1` / `2` / `3` | Toggle sembunyikan/tampilkan panel Slides, Storyline, Properti |
| `←` / `→` di tab Storyline/Asset | Pindah tab |

---

## 🤖 Integrasi AI Agent (MCP Server)

Stomake dilengkapi server **Model Context Protocol (MCP)** bawaan untuk integrasi langsung dengan AI coding agent.

### Mengaktifkan MCP
1. Buka ⚙ **Pengaturan** di kanan atas aplikasi.
2. Nyalakan switch **MCP (agent AI)**.
3. Konfigurasikan pada client agent pilihan Anda:

```json
{
  "mcpServers": {
    "stomake": {
      "type": "http",
      "url": "http://127.0.0.1:5179/mcp"
    }
  }
}
```

*Contoh Claude Code:*
```bash
claude mcp add --transport http stomake http://127.0.0.1:5179/mcp
```

> MCP punya port sendiri (default **5179**), terpisah dari aplikasi (5178). Agent yang dulu didaftarkan ke `:5178/mcp` perlu diganti ke URL di Pengaturan.

### Konfigurasi

Semua ada di ⚙ **Pengaturan → MCP**, berlaku langsung tanpa restart:

| Bagian | Isi |
|---|---|
| Koneksi | Port (1024–65535). Bila port dipakai program lain, setelan lama tetap dan muncul pesan. Host tambahan selain `127.0.0.1`/`localhost` (mis. `storyboard.local`). |
| Kunci editor | Berapa detik setelah panggilan terakhir editor dibuka lagi (default 10), dan berapa lama agent menunggu editor menyimpan sebelum mulai (default 3). |
| Izin tool | Matikan tool per tool atau per kelompok (Membaca, Mengubah project, Membuat gambar, Export & sesi). Tool yang dimatikan tidak terlihat oleh agent. |
| Log | Catat panggilan, simpan isi input/hasil atau tidak, dan jumlah entri maksimum (default 2000). |

Variabel `STORYBOARD_MCP_PORT` mengunci port dari luar aplikasi.

### Log MCP

**Pengaturan → MCP → Buka log MCP** (atau `/mcp-logs`) menampilkan setiap koneksi, daftar tool, dan panggilan tool beserta status, durasi, nama client agent, input, dan hasilnya. Panggilan yang ditolak (MCP mati, host asing, tool dimatikan) ikut tercatat.

- Filter: cari teks (termasuk isi input/hasil), status Berhasil/Gagal, tool, jenis, project, dan rentang waktu. Filter tersimpan di URL.
- **Live** memperbarui tabel saat agent bekerja. Klik baris untuk melihat detail; `↑`/`↓` pindah baris, `Esc` menutup detail.
- **Export** mengunduh hasil filter sebagai `.jsonl`; **Hapus log** mengosongkan semuanya.
- Log disimpan di `<folder penyimpanan>/logs/mcp.jsonl`. Teks panjang (mis. kode SVG) dipotong 2000 karakter.

### 25 Tools yang Tersedia untuk AI:
- **Membaca**: `list_projects`, `get_project`, `get_storyline`, `list_assets`, `list_fonts`, `check_storyboard`
- **Proyek & naskah**: `create_project`, `set_storyline`
- **Halaman & Scene**: `add_page`, `remove_page`, `add_scene`, `remove_scene`, `update_scene`, `set_cover`, `set_background`
- **Layer**: `add_layer`, `add_layers`, `update_layer`, `remove_layer`, `reorder_layer`, `group_layers`
- **Membuat gambar**: `add_svg_asset`, `add_pattern_asset`
- **Output & Sesi**: `export_pdf`, `finish_editing`

### Aturan isi storyboard yang dipakai agent

Server mengirim aturan ini ke agent saat tersambung, jadi tidak perlu diulang di setiap perintah:

1. **Teks = layer teks, bukan gambar.** Judul, label, dan angka harus `add_layer`/`add_layers` bertipe `text` agar tetap bisa diedit, diganti font, dan dicari di PDF. Menulis teks di dalam `add_svg_asset` ditolak server (`<text>`, `<tspan>`, `<textPath>`, `<foreignObject>`).
2. **Kalimat panjang pakai kotak lipat.** Layer teks menerima `width` (lebar lipat), `align` (kiri/tengah/kanan), dan `lineHeight`, jadi narasi panjang turun baris sendiri, bukan satu baris yang keluar frame.
3. **Font hanya dari `list_fonts`** — 15 font bawaan yang benar-benar ikut saat export PDF.
4. **Background tidak boleh polos.** `add_pattern_asset` membuat latar bermotif (`grid`, `graph`, `dots`, `diagonal`, `rays`, `checker`, `waves`) dengan warna, gradien dua warna, kerapatan, ketebalan, transparansi motif, dan vignette opsional.
5. **Frame harus informatif**: subjek digabung penanda makna (panah, target, silang, balon kata, badge angka, emoji reaksi), 2–5 layer per frame, disusun sekali jalan lewat `add_layers`.
6. **Catatan efek dan subtitle wajib diisi** lewat `update_scene`, diambil dari storyline.
7. **`check_storyboard` sebelum selesai**: melaporkan asset/background hilang, layer di luar frame, teks terlalu kecil untuk PDF, kalimat panjang tanpa `width`, frame kosong, subtitle kosong, dan background polos di semua frame.

### Agent menggambar ilustrasi sendiri

Dengan `add_svg_asset`, agent menulis kode SVG (gelas, es batu, gunung es, diagram), lalu server mengubahnya jadi PNG transparan dan menyimpannya di tab **Asset** project. Gambar langsung muncul di editor yang sedang terbuka, dan `assetRef` hasilnya bisa dipakai di `add_layer` atau `set_background`. Cocok untuk ilustrasi flat, ikon, dan diagram; untuk foto atau karakter realistis tetap pakai gambar asli.

Contoh perintah ke agent:

> Buat project "Kenapa Es Batu Mengapung?", gambar sendiri gelas berisi air, es batu, dan gunung es dengan SVG, pakai latar kertas milimeter, lalu susun 3 scene yang menjelaskannya.

Proses render berjalan di Chromium tanpa JavaScript dan tanpa akses jaringan: script, gambar dari URL, dan font eksternal di dalam SVG diabaikan. Batasnya SVG maks 1 MB dan PNG maks 2048 px.

*Catatan Keamanan*: Server MCP hanya mendengarkan pada antarmuka lokal `127.0.0.1` dan menolak akses dari host eksternal.

---

## 🛠️ Pengembangan (Development)

```bash
# Menjalankan mode pengembangan (Server :5178 + Vite HMR :5173)
pnpm dev

# Menjalankan unit test & test export PDF
pnpm test

# Menjalankan pengujian End-to-End Playwright
pnpm e2e

# Validasi tipe TypeScript
pnpm typecheck
```

---

## 🏷️ Rilis versi baru

Versi aplikasi diambil dari `package.json` (desktop membacanya lewat `tauri.conf.json`). Catatan perubahan ditulis di [`CHANGELOG.md`](CHANGELOG.md) dan menjadi deskripsi halaman download.

1. Tulis perubahan di bawah `## [Unreleased]` di `CHANGELOG.md`, lalu commit.
2. Jalankan salah satu:

   ```bash
   pnpm release patch --push   # 0.1.0 → 0.1.1
   pnpm release minor --push   # 0.1.0 → 0.2.0
   pnpm release 1.0.0 --push   # versi tertentu
   ```

   Script menaikkan versi di `package.json` dan `src-tauri/Cargo.toml`, memindahkan isi *Unreleased* ke `## [x.y.z] - tanggal`, commit `release: vX.Y.Z`, membuat tag `vX.Y.Z`, lalu push. Tanpa `--push`, push sendiri dengan `git push --follow-tags`.
3. Tag `v*.*.*` menjalankan workflow [`.github/workflows/release.yml`](.github/workflows/release.yml): build installer Windows (`.exe` + `.msi`) dan Linux (`.AppImage`) secara paralel, lalu menerbitkan GitHub Release berisi tabel download dan changelog versi tersebut. Bila salah satu build gagal, rilis tetap berstatus draft.

Workflow menolak tag yang tidak sama dengan versi di `package.json`, dan rilis gagal bila bagian changelog versi itu kosong.

Panduan lengkap (persiapan repo, memantau build, mengulang rilis yang gagal): [`docs/GITHUB.md`](docs/GITHUB.md).

---

## 📄 Lisensi

Didistribusikan di bawah lisensi MIT.
