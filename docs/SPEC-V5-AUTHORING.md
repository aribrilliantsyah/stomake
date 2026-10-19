# Storyboard Maker V5: tool authoring lengkap untuk agent

Di atas `docs/SPEC-V4-MCP.md`. Tanggal: 2026-10-18.

## 1. Masalah

Dengan 20 tool V4, agent tetap menggambar hampir semua isi frame lewat `add_svg_asset`, termasuk judul dan label, lalu memasang satu PNG besar per scene. Akibatnya:

- Teks tidak bisa diedit, diganti font, atau dicari di PDF, dan terender dengan font fallback karena sandbox SVG tidak memuat font aplikasi.
- Background tetap warna polos (`set_background` hanya menerima `color` atau asset yang sudah ada).
- Satu frame butuh banyak panggilan `add_layer` berurutan, jadi satu gambar raster terasa lebih murah bagi agent.

## 2. Tujuan

1. Semua elemen yang tampak di frame bisa dibuat sebagai layer asli (teks, shape, emoji, gambar), termasuk teks panjang multi-baris.
2. Background bermotif bisa dibuat agent tanpa aset dari luar.
3. Aturan isi storyboard dikirim server, bukan bergantung prompt user.
4. Agent bisa memeriksa hasil kerjanya sendiri sebelum menyerahkan ke user.

## 3. Model data

`TextLayer` bertambah tiga field opsional (project tetap `version: 2`; file lama valid tanpa migrasi karena field opsional):

```ts
interface TextLayer extends LayerBase {
  // ...
  /** lebar kotak lipat dalam satuan panel; tidak ada = satu baris */
  width?: number;
  /** perataan baris; tidak ada = center */
  align?: 'left' | 'center' | 'right';
  /** jarak baris × fontSize; tidak ada = 1 */
  lineHeight?: number;
}
```

- Konva merender dengan `wrap: 'word'` saat `width` ada, `'none'` bila tidak, jadi editor, thumbnail, dan PDF memakai jalur render yang sama.
- Transformer: layer teks ber-`width` mendapat anchor samping dan rasio bebas (tarik samping = ubah lebar lipat, tarik atas-bawah = ubah `fontSize`). Teks satu baris tetap seperti dulu.
- PropsPanel: checkbox "Teks multi-baris (lipat otomatis)" lalu Lebar / Rata / Jarak baris.

## 4. Tool baru (total 25)

| Tool | Kelompok | Input | Hasil |
|---|---|---|---|
| `list_fonts` | read | `{}` | `{ fonts: string[], default }` — hanya font bawaan yang ikut saat export |
| `check_storyboard` | read | `{ slug }` | `{ ok, issues: [{ level: 'error' \| 'warning', where, message }] }` |
| `add_layers` | edit | `{ slug, panelId, layers: LayerSpec[] }` (1–30, belakang → depan) | `{ layerIds }` |
| `group_layers` | edit | `{ slug, panelId, layerIds, ungroup? }` | `{ groupId \| null }` |
| `add_pattern_asset` | asset | `{ slug, name, kind, color?, color2?, ink?, cell?, thickness?, inkOpacity?, vignette?, width?, height? }` | `{ assetRef, name, width, height }` |

`add_layers` menulis seluruh frame dalam satu `updateProjectOnDisk`: satu siklus kunci agent, satu event `project`, satu langkah undo untuk user.

`check_storyboard` murni baca dan melaporkan:

- **error**: `ref` layer atau background menunjuk asset yang tidak ada.
- **warning**: layer di luar kotak panel, `fontSize < 48` (di bawah ±9pt saat dicetak), teks > 24 karakter tanpa `width`, `width` melebihi lebar panel, frame tanpa layer, subtitle kosong, dan semua panel memakai background warna polos.

## 5. Background bermotif

`src/server/patterns.ts` menghasilkan SVG murni geometri (tanpa script, gambar luar, atau font) lalu memakai renderer `svgAsset` yang sudah ada:

| kind | motif |
|---|---|
| `grid` | kotak-kotak |
| `graph` | kertas milimeter (5 garis halus + garis tebal per sel) |
| `dots` | titik |
| `diagonal` | garis miring |
| `rays` | sunburst dari tengah |
| `checker` | papan catur |
| `waves` | gelombang |

Default: 1080×2048 px maks, `cell` 90, `thickness` 3, `inkOpacity` 0.18. `color2` mengubah dasar jadi gradien vertikal; `vignette` menggelapkan sudut. Hasilnya asset PNG project biasa, jadi langsung bisa dipakai `set_background` atau `add_layer`.

## 6. Teks tidak boleh di-raster

`add_svg_asset` menolak SVG yang memuat `<text>`, `<tspan>`, `<textPath>`, atau `<foreignObject>` dengan pesan yang mengarahkan ke `add_layer` bertipe `text`. Alasannya teknis, bukan selera: sandbox render memuat SVG sebagai `<img>` tanpa akses jaringan dan tanpa font aplikasi, jadi teks di dalamnya selalu salah font dan permanen.

## 7. Instructions MCP

`initialize` mengirim aturan rumah (lihat `INSTRUCTIONS` di `src/server/mcp/server.ts`): teks sebagai layer, kalimat panjang pakai `width`, font dari `list_fonts`, background bermotif sebagai default, frame informatif 2–5 layer, `note`/`subtitle` wajib, area aman y 120–1800, `add_layers` sekali jalan, dan `check_storyboard` sebelum `finish_editing`.
