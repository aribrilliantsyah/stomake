# Storyboard Maker

Aplikasi web lokal untuk membuat storyboard video 9:16 dari storyline lalu export PDF bergaya template Canva (untuk dikirim ke video editor).

- Project → page → 1–3 scene per page; nomor scene berlanjut antar page, page dengan 1–2 scene diletakkan di tengah.
- Per scene: catatan efek (atas), frame 9:16, subtitle/narasi (bawah). Opsional split atas-bawah (kondisi awal → akhir).
- Storyline viewer di samping (paste / import `.docx`) untuk copy-paste ke scene.
- Asset per project + global, drag & drop ke canvas; background per scene/panel dan per page (warna atau asset).
- Layer: gambar (geser, resize, rotate, flip, opacity, urutan), teks, panah, emoji. Duplikat scene.
- Autosave, undo/redo (Ctrl+Z / Ctrl+Shift+Z).

Dokumen: [docs/SPEC.md](docs/SPEC.md), [docs/PLAN.md](docs/PLAN.md).

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
| Esc | Batal pilih |

## Development

```bash
pnpm dev              # server :5178 + vite :5173 (buka http://localhost:5173)
pnpm test             # unit + api + export pdf (butuh pdftotext/pdfinfo dari poppler)
pnpm e2e              # playwright end-to-end
pnpm typecheck
```

Konstanta layout PDF (posisi kolom, ukuran frame, font) ada di `src/shared/layout.ts`.
