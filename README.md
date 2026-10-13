# Storyboard Maker

Aplikasi web lokal untuk membuat storyboard video 9:16 dari storyline lalu export PDF bergaya template Canva (untuk dikirim ke video editor).

- Editor gaya PowerPoint: panel Slides (Cover opsional + page), page aktif tampil seperti PDF dan frame-nya bisa diedit langsung.
- Page berisi 1–3 scene; "+ Page" dan "+ Scene" diatur sendiri (tidak ada pemindahan otomatis). Nomor scene berlanjut antar page.
- Cover "VISUAL ASLI" opsional: satu frame di tengah, tidak dihitung sebagai scene.
- Per scene: catatan efek (atas), frame 9:16, subtitle/narasi (bawah). Opsional split atas-bawah (kondisi awal → akhir).
- Storyline viewer di samping (paste / import `.docx`) untuk copy-paste ke scene.
- Asset per project + global, drag & drop ke canvas; background per scene/panel dan per page (warna atau asset).
- Layer: gambar (geser, resize, rotate, flip, opacity, urutan), teks (15 font bawaan + font laptop via Chrome), 10 shape (kotak, elips, garis, panah, panah 2 arah, target, silang, bintang, balon kata), emoji. Duplikat scene/page.
- Ctrl+C / Ctrl+X / Ctrl+V layer antar scene; paste gambar (screenshot) langsung jadi asset project.
- Autosave, undo/redo (Ctrl+Z / Ctrl+Shift+Z).

Dokumen: [docs/SPEC.md](docs/SPEC.md), [docs/SPEC-V2.md](docs/SPEC-V2.md), [docs/PLAN.md](docs/PLAN.md), [docs/PLAN-V2.md](docs/PLAN-V2.md).

## Pakai

```bash
pnpm install
pnpm start            # build + server di http://127.0.0.1:5178
```

Export PDF memakai Chromium lewat Playwright. Bila belum ada browser yang cocok, aplikasi mencoba Google Chrome/Chromium sistem; kalau gagal jalankan sekali:

```bash
pnpm exec playwright install chromium
```

Data disimpan di `~/Storyboard` (ubah dengan env `STORYBOARD_HOME`):

```
~/Storyboard/library/                  asset global
~/Storyboard/projects/<slug>/project.json
                            storyline.txt
                            assets/
                            exports/storyboard.pdf
```

## Shortcut editor

| Tombol | Aksi |
|---|---|
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Delete | Hapus layer terpilih |
| Ctrl+D | Duplikat layer |
| `]` / `[` | Layer naik / turun (Shift = paling depan / belakang) |
| Panah | Geser layer 5px (Shift = 50px) |
| Esc | Batal pilih / keluar zoom |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / potong / tempel layer (atau gambar dari clipboard) |
| Z / double-click frame | Zoom satu scene |
| Ctrl+1 / Ctrl+2 / Ctrl+3 | Lipat panel Slides / Storyline-Asset / Properti |

## Development

```bash
pnpm dev              # server :5178 + vite :5173 (buka http://localhost:5173)
pnpm test             # unit + api + export pdf (butuh pdftotext/pdfinfo dari poppler)
pnpm e2e              # playwright end-to-end
pnpm typecheck
```

Konstanta layout PDF (posisi kolom, ukuran frame, font) ada di `src/shared/layout.ts`.
