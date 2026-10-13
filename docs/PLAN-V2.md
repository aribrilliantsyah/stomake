# Storyboard Maker V2 (revisi 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ubah editor menjadi gaya PowerPoint (slide = page berisi 1–3 scene, cover opsional, page bisa diedit langsung), tambah shape, font, Ctrl+C/V, sidebar lipat, dan toast otomatis.

**Architecture:** Model data naik ke v2 (`cover`, `ShapeLayer`, `font: string`) dengan migrasi di `src/shared/migrate.ts` yang dipanggil server saat membaca. Operasi page menggantikan reflow otomatis di `src/shared/model.ts`. Tampilan page di editor memakai ulang `PageSheet` dengan prop `interactive`, sehingga editor dan PDF tetap satu implementasi.

**Tech Stack:** sama dengan v1 (TypeScript, pnpm, Vite, React 19, react-konva, zustand, zod, Hono, Playwright) + @fontsource untuk 12 font tambahan.

**Spec:** `docs/SPEC-V2.md` (di atas `docs/SPEC.md`)

## Global Constraints

- pnpm saja; commit setiap task.
- Page berisi 1..3 scene; operasi tidak pernah membuat/menghapus page secara otomatis kecuali `addPage`/`removePage`.
- Nomor scene dihitung dari urutan, cover tidak dihitung.
- Project v1 harus tetap bisa dibuka (migrasi otomatis); `ArrowLayer` lama tetap valid.
- Layout PDF v1 (§5 SPEC.md) tidak berubah; cover memakai §4 SPEC-V2.
- Toast: sukses/info 4000 ms, warn 8000 ms, error tanpa timeout; maks 4 terlihat.
- Shortcut panel Ctrl+1/2/3; status lipat di localStorage key `sb.panels`.
- UI compact, border 1px, tanpa gradient/glow/kartu bulat besar.

## Review Focus

- Project lama (v1, demo selimut darurat) dibuka setelah update: tampil sama, tidak error, tersimpan sebagai v2. → test di Task 1.
- Paste saat fokus di textarea subtitle/storyline: harus paste teks biasa, bukan layer/gambar. → test di Task 7.
- Hapus page yang berisi scene aktif / hapus cover saat cover dipilih: seleksi pindah ke page terdekat, tidak crash. → test di Task 3.
- Font laptop dipakai lalu project dibuka tanpa izin font: canvas fallback, export melaporkan `missingFonts`. → test di Task 9.
- Shape dengan width/height 0 (garis) di-resize lewat Transformer: tidak menjadi NaN/negatif. → test di Task 4.

---

## File Structure

```
src/shared/types.ts        + Cover, ShapeLayer, ShapeKind; version 2; font: string
src/shared/schema.ts       v2 schema; parseProject menerima v1 lewat migrate
src/shared/migrate.ts      migrateProject(raw): ProjectV2   (baru)
src/shared/model.ts        operasi page & cover, defaultShape, pasteLayer; hapus reflow
src/shared/fonts.ts        BUILTIN_FONTS daftar nama (baru, dipakai web & test)
src/shared/layout.ts       + COVER konstanta
src/web/fonts.ts           muat font bawaan + font laptop
src/web/state/editorStore.ts  + currentPageId/selectedCover, clipboard
src/web/state/uiStore.ts   panel lipat + toast (baru)
src/web/ui/Toasts.tsx      (baru)
src/web/editor/Editor.tsx  layout 4 kolom, mode page / zoom
src/web/editor/SlidesPanel.tsx   (baru)
src/web/editor/ShapeMenu.tsx     (baru)
src/web/editor/FontPicker.tsx    (baru)
src/web/editor/clipboard.ts      handler copy/cut/paste (baru)
src/web/editor/LayerNode.tsx     + render shape
src/web/editor/PropsPanel.tsx    + props shape, font picker, cover
src/web/print/PageSheet.tsx      + prop interactive, CoverSheet
src/web/print/PrintRoute.tsx     + cover, missingFonts
src/server/store.ts        baca → migrate
```

---

### Task 1: Model v2 + migrasi

**Files:**
- Create: `src/shared/migrate.ts`
- Modify: `src/shared/types.ts`, `src/shared/schema.ts`, `src/shared/model.ts` (`createProject`), `src/server/store.ts` (`readProject`)
- Test: `tests/migrate.test.ts`; update `tests/schema.test.ts`, `tests/model.test.ts`

**Interfaces:**
- Produces:
  - Tipe `Cover`, `ShapeKind`, `ShapeLayer` persis §3 SPEC-V2; `Project.version: 2`, `Project.cover: Cover | null`, `TextLayer.font: string`.
  - `migrateProject(raw: unknown): unknown` — v1 → `{...raw, version: 2, cover: null}`; v2 dikembalikan apa adanya; lainnya tidak diubah (schema yang menolak).
  - `parseProject(x)` memanggil `migrateProject` dulu.
  - `createProject(name, now)` → `version: 2, cover: null`.

- [ ] **Step 1: Failing tests**

```ts
test('v1 dimigrasi ke v2 dengan cover null', () => {
  const v1 = { ...createProject('A', 'now'), version: 1 }; delete (v1 as any).cover;
  const p = parseProject(v1);
  expect(p.version).toBe(2); expect(p.cover).toBeNull(); expect(p.pages).toEqual(v1.pages);
});
test('arrow layer lama tetap valid', ...);            // v1 project dengan type:'arrow'
test('shape layer valid; shape kind asing ditolak', ...);
test('text font string bebas diterima ("Poppins", "Ubuntu Mono")', ...);
test('cover.panel dengan layer diterima; cover tanpa title ditolak', ...);
test('readProject pada file v1 di disk → v2, file belum ditulis ulang', ...); // tests/server-projects.test.ts
```

- [ ] **Step 2:** `pnpm test` → FAIL. **Step 3:** implement. **Step 4:** `pnpm test` → PASS (termasuk test lama setelah `version` diperbarui).
- [ ] **Step 5: Commit** `feat(shared): project v2 model with cover, shapes, free font; v1 migration`

---

### Task 2: Operasi page gaya PPT

**Files:**
- Modify: `src/shared/model.ts`
- Test: `tests/model.test.ts` (ganti test reflow lama)

**Interfaces:**
- Produces (semua murni):
  - `addSceneInPage(p, pageId: string, afterSceneId: string | null): { project: Project; sceneId: string } | null` — null bila page sudah 3 scene. `afterSceneId` null = di akhir page.
  - `addPage(p, afterPageId: string | null): { project: Project; pageId: string; sceneId: string }` — page baru 1 scene kosong, background null; `afterPageId` null = di awal.
  - `duplicatePage(p, pageId): { project: Project; pageId: string }` — id baru untuk page/scene/panel/layer.
  - `removePage(p, pageId): Project` — no-op bila satu-satunya page.
  - `movePage(p, pageId, dir: -1 | 1): Project`
  - `canRemoveScene(p, sceneId): boolean` — false bila scene satu-satunya di page-nya.
  - `removeScene(p, sceneId)` — no-op bila `!canRemoveScene` (tidak lagi menghapus page).
  - `moveScene(p, sceneId, dir)` — hanya di dalam page; di ujung page = no-op.
  - `duplicateScene(p, sceneId)` — null-safe: bila page penuh kembalikan `{ project: p, sceneId: sceneId }` tanpa perubahan.
  - `pageOf(p, sceneId): Page | null`
  - Dihapus: `addSceneAfter` dan reflow `normalize`. Pemanggil di web diganti di Task 6.

- [ ] **Step 1: Failing tests**

```ts
test('+Scene di page berisi 3 → null', ...);
test('addPage setelah P1 → page baru di index 1 dengan 1 scene, nomor scene berikutnya bergeser', () => {
  // P1[1], P2[2,3] ; addPage(after P1) → P1[1], Pbaru[2], P2[3,4]
});
test('tidak ada reflow: P1[1], P2[2,3] + scene di P2 → P1[1], P2[2,3,4]; page 1 tetap 1 scene', ...);
test('removeScene scene satu-satunya di page = no-op; canRemoveScene false', ...);
test('removePage menghapus page beserta scene-nya, nomor bergeser; page terakhir tidak bisa dihapus', ...);
test('movePage & moveScene di ujung page = no-op', ...);
test('duplicatePage: id baru semua, isi sama, disisipkan setelah sumber', ...);
test('duplicateScene di page penuh → project tidak berubah', ...);
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(shared): ppt-style page operations, no auto reflow`

---

### Task 3: Cover + seleksi

**Files:**
- Modify: `src/shared/model.ts`, `src/shared/layout.ts`, `src/web/state/editorStore.ts`
- Test: `tests/model.test.ts`, `tests/editorStore.test.ts`

**Interfaces:**
- Produces:
  - `addCover(p): Project` (judul `'VISUAL ASLI'`, panel putih kosong; no-op bila sudah ada), `removeCover(p)`, `updateCover(p, patch: Partial<Pick<Cover,'title'>>)`.
  - `findPanel(p, panelId)` juga mencari `cover.panel` → `{ panel, scene: null }`; `updatePanel` juga bekerja untuk cover panel. Tipe kembalian `findPanel` jadi `{ panel: Panel; scene: Scene | null } | null`.
  - `COVER = { titleY: 23, titleSize: 30, x: 282.375, y: 128 }` di layout.ts.
  - Store: state `selection: { kind: 'scene'; sceneId: string } | { kind: 'cover' }` menggantikan `currentSceneId`; helper `currentPageIndex(): number` (-1 untuk cover); `selectCover()`, `selectScene(id)`. `fixSelection` setelah perubahan: cover hilang → scene pertama; scene hilang → scene di posisi sama di page yang sama, lalu page sebelumnya.

- [ ] **Step 1: Failing tests**

```ts
test('addCover tidak mengubah nomor scene', ...);
test('updatePanel pada cover panel menambah layer', ...);
test('store: hapus cover saat cover dipilih → seleksi scene pertama', ...);
test('store: removePage page aktif → seleksi scene pertama page sebelumnya (atau berikutnya bila page 0)', ...);
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: optional cover page and selection model`

---

### Task 4: Shape layer

**Files:**
- Create: `src/web/editor/ShapeMenu.tsx`
- Modify: `src/shared/model.ts`, `src/web/editor/LayerNode.tsx`, `src/web/editor/PropsPanel.tsx`, `src/web/editor/Toolbar.tsx`
- Test: `tests/shapes.test.ts`

**Interfaces:**
- Produces:
  - `defaultShape(kind: ShapeKind, space: Space): ShapeLayer` — nilai §5 SPEC-V2 (400×400; `line`/`arrow`/`doubleArrow` 500×0; `target` stroke `#E53935`; `bubble` fill `#FFFFFF`; lainnya fill null, stroke `#000000`, strokeWidth 12, dash false), pusat panel.
  - `resizeShape(l: ShapeLayer, sx: number, sy: number): Pick<ShapeLayer,'width'|'height'>` — `max(0, round)`; dimensi 0 tetap 0; tidak pernah NaN.
  - LayerNode merender: rect/roundRect (`cornerRadius` = 12% sisi pendek), ellipse, line/arrow/doubleArrow (Konva.Arrow `pointerAtBeginning`), target (3 lingkaran konsentris radius 100/66/33% dari min(w,h)/2), cross (2 garis diagonal), star (Konva.Star 5 sudut, inner 0.45), bubble (Konva.Path rounded rect + ekor di kiri bawah, dibangun dari w,h). `dash` → `[strokeWidth*2, strokeWidth*1.5]`.
  - Transformer untuk shape: semua anchor, `keepRatio` false; onTransformEnd memakai `resizeShape`.
  - ShapeMenu: grid 10 tombol berlabel ikon teks (□ ▢ ○ ─ → ↔ ◎ ✕ ☆ 💬).

- [ ] **Step 1: Failing tests**

```ts
test('defaultShape rect/target/bubble/line nilai default', ...);
test('resizeShape line (h=0) tetap 0, tidak NaN', () => expect(resizeShape(line, 2, 3)).toEqual({ width: 1000, height: 0 }));
test('resizeShape negatif/NaN → 0', ...);
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Manual check:** tambah tiap shape di dev, resize & rotate, ubah isi/garis/putus-putus di panel kanan.
- [ ] **Step 6: Commit** `feat: shape layers (10 kinds) with fill/stroke/dash`

---

### Task 5: Font bawaan + font laptop

**Files:**
- Create: `src/shared/fonts.ts`, `src/web/editor/FontPicker.tsx`
- Modify: `src/web/fonts.ts`, `src/web/main.tsx`, `src/web/editor/LayerNode.tsx` (`FONT_STACK` → fungsi), `src/web/editor/PropsPanel.tsx`, `package.json`
- Test: `tests/fonts.test.ts`

**Interfaces:**
- Produces:
  - `BUILTIN_FONTS: readonly string[]` — 15 nama W9 SPEC-V2, urutan itu.
  - `fontStack(name: string): string` → `"<name>", "Coming Soon", sans-serif` (nama di-quote; tanda kutip di nama di-escape).
  - web `loadFonts()` memuat 15 font bawaan (import `@fontsource/<slug>/400.css`); `loadFont(name): Promise<boolean>` untuk font laptop/bawaan sebelum render; `listLocalFonts(): Promise<string[]>` (unik, terurut; [] bila API tidak ada/ditolak); `isFontAvailable(name): boolean` (`document.fonts.check`).
  - FontPicker props `{ value: string; onChange(name: string): void }`: input cari, grup Bawaan & Laptop, pratinjau nama dalam fontnya, tombol "Muat font laptop".
  - Setelah ganti font: `loadFont(name)` lalu redraw (key layer berubah) agar offset teks benar.

- [ ] **Step 1: Failing tests**

```ts
test('BUILTIN_FONTS berisi 15 nama termasuk Bangers & Coming Soon', ...);
test('fontStack quote & escape', () => expect(fontStack('My "Font"')).toBe('"My \\"Font\\"", "Coming Soon", sans-serif'));
test('setiap BUILTIN_FONTS punya paket @fontsource terpasang', () => {
  for (const f of BUILTIN_FONTS) expect(existsSync(`node_modules/@fontsource/${slug(f)}/400.css`)).toBe(true);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** `pnpm add @fontsource/poppins @fontsource/montserrat @fontsource/bebas-neue @fontsource/anton @fontsource/permanent-marker @fontsource/luckiest-guy @fontsource/fredoka @fontsource/patrick-hand @fontsource/oswald @fontsource/roboto-slab @fontsource/caveat @fontsource/lilita-one`; implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: 15 bundled fonts, local font access, font picker`

---

### Task 6: Layout PPT — Slides, page editable, zoom, sidebar lipat

**Files:**
- Create: `src/web/editor/SlidesPanel.tsx`, `src/web/state/uiStore.ts`
- Modify: `src/web/editor/Editor.tsx`, `src/web/print/PageSheet.tsx`, `src/web/editor/PropsPanel.tsx`, `src/web/styles.css`; Delete: `src/web/editor/PageStrip.tsx`
- Test: `tests/uiStore.test.ts`

**Interfaces:**
- Consumes: operasi page (Task 2), cover & selection (Task 3).
- Produces:
  - `useUi` zustand: `panels: { slides: boolean; library: boolean; props: boolean }`, `togglePanel(name)`, persist ke localStorage `sb.panels`; `zoom: boolean`, `setZoom(b)`.
  - `PageSheet` props baru: `interactive?: boolean`, `scale?: number` (CSS transform), `activeSceneId?`, `selectedLayerId?`, `activePanelId?`, `onSelectScene?(id)`, `onSelectLayer?`, `onChangeLayer?`, `onDropAsset?(sceneId, panelIndex, x, y)`; scene aktif diberi outline biru 2px. Tanpa prop baru = perilaku print v1.
  - `CoverSheet` (di PageSheet.tsx) dengan props interaktif sama, tanpa label/catatan/subtitle.
  - `SlidesPanel`: thumbnail (`PageSheet` non-interaktif, scale ≈ 0.2, pixelRatio 1), label "Cover"/"P1…" + rentang nomor scene ("1–3"), menu ⋯ (Duplikat, Hapus, Naik, Turun), drag-reorder (memanggil `movePage` berulang), tombol "+ Page" dan "+ Cover".
  - Editor: grid kolom `[slides 160px] [library 280px] [1fr] [props 300px]`, kolom tertutup = 28px strip dengan tombol »; Ctrl+1/2/3; tombol bawah page: + Scene (disabled saat 3), Duplikat (disabled saat 3), Hapus (disabled bila `!canRemoveScene`), ←, →, Zoom; double-click frame / Z = zoom, Esc keluar.

- [ ] **Step 1: Failing tests**

```ts
test('togglePanel persist ke localStorage sb.panels', ...);   // jsdom
test('default semua panel terbuka', ...);
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Manual check (browser):** demo selimut darurat terbuka sebagai slide; klik frame Scene 2 di P1 → panel kanan Scene 2; drag asset ke frame Scene 3 → layer di Scene 3; lipat ketiga panel; zoom lalu Esc.
- [ ] **Step 6: Commit** `feat(web): ppt-style editor with slides, editable page view, collapsible panels`

---

### Task 7: Clipboard (Ctrl+C / Ctrl+X / Ctrl+V)

**Files:**
- Create: `src/web/editor/clipboard.ts`
- Modify: `src/shared/model.ts`, `src/web/editor/Editor.tsx`, `src/web/api.ts`
- Test: `tests/clipboard.test.ts`

**Interfaces:**
- Produces:
  - model: `pasteLayer(p, panelId, layer: Layer, sameSource: boolean): { project: Project; layerId: string }` — id baru; `sameSource` → x+40, y+40.
  - `pasteFileName(now: Date): string` → `paste-YYYYMMDD-HHMMSS.png` (waktu lokal).
  - `handleCopy/handleCut/handlePaste(e: ClipboardEvent)` dipasang di `document` (`copy`, `cut`, `paste`), aktif hanya bila target bukan input/textarea/select/contentEditable. Clipboard layer: `{ layer: Layer; panelId: string } | null` di editorStore.
  - Paste: bila `e.clipboardData.files` berisi image → `api.uploadAssets('project', [renamed file], slug)` → `layerFromDrop` di tengah panel aktif; selain itu bila ada clipboard layer → `pasteLayer`.

- [ ] **Step 1: Failing tests**

```ts
test('pasteLayer ke panel lain: posisi sama, id baru', ...);
test('pasteLayer sumber sama: +40,+40', ...);
test('pasteFileName', () => expect(pasteFileName(new Date(2026, 9, 13, 9, 5, 7))).toBe('paste-20261013-090507.png'));
test('handlePaste diabaikan saat target textarea', ...);    // jsdom, handler tidak memanggil preventDefault
test('handlePaste dengan file image memanggil uploadAssets lalu menambah layer', ...);  // api di-mock
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat: copy/cut/paste layers and paste images from system clipboard`

---

### Task 8: Toast otomatis

**Files:**
- Create: `src/web/ui/Toasts.tsx`; Modify: `src/web/state/uiStore.ts`, `src/web/editor/Toolbar.tsx`, `src/web/editor/AssetPanel.tsx`, `src/web/editor/StorylinePanel.tsx`
- Test: `tests/uiStore.test.ts`

**Interfaces:**
- Produces: `toast(kind: 'ok' | 'info' | 'warn' | 'err', text: string, link?: { href: string; label: string }): string` di uiStore; `dismissToast(id)`; state `toasts` (maks 4, yang tertua dibuang). Durasi: ok/info 4000, warn 8000, err tanpa timer. `<Toasts />` di pojok kanan bawah. Toolbar export & error upload/import memakai `toast()`; state toast lokal di Toolbar dihapus.

- [ ] **Step 1: Failing tests** (fake timers)

```ts
test('ok hilang setelah 4000ms, warn setelah 8000ms, err tetap', ...);
test('maks 4 toast, tertua dibuang', ...);
test('dismissToast menghapus dan membatalkan timer', ...);
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(web): auto-dismissing stacked toasts`

---

### Task 9: Print/export: cover, font, verifikasi

**Files:**
- Modify: `src/web/print/PrintRoute.tsx`, `src/web/print/PageSheet.tsx`, `src/server/export.ts`, `src/shared/print-globals.d.ts`, `e2e/export.spec.ts`, `README.md`, `scripts/demo-selimut.ts`
- Test: `tests/export.test.ts`, `e2e/export.spec.ts`

**Interfaces:**
- Produces: PrintRoute merender `CoverSheet` lebih dulu bila `cover` ada; memuat semua font yang dipakai text layer (`loadFont`) sebelum siap; `window.__MISSING_FONTS__`; `exportPdf` mengembalikan `{ path, missingAssets, fonts, missingFonts }`; toast warn di Toolbar bila `missingFonts` tidak kosong.

- [ ] **Step 1: Failing tests**

```ts
test('cover → PDF halaman 1 berisi "VISUAL ASLI" tanpa "Scene"; "Scene 1" di halaman 2', ...);
test('page berisi 1 scene → frame di tengah (pdftotext -bbox: "Scene" x ≈ 282)', ...);
test('text layer font "Poppins" → missingFonts [] ; font "Font Tidak Ada" → missingFonts ["Font Tidak Ada"]', ...);
```

E2E tambahan:

```ts
test('+ Page, + Scene sampai 3 → tombol nonaktif', ...);
test('Ctrl+C layer di Scene 1, pilih Scene 2, Ctrl+V → layer muncul di Scene 2', ...);
test('Ctrl+2 melipat panel Storyline/Asset', ...);
```

- [ ] **Step 2–4:** FAIL → implement → PASS (`pnpm test` dan `pnpm e2e`).
- [ ] **Step 5:** Update demo script (P1 dengan 1 scene + cover) dan README (shortcut baru). Jalankan demo, bandingkan PDF visual.
- [ ] **Step 6: Commit** `feat: cover in pdf export, font verification, e2e for ppt flow`

---

## Spec coverage

| SPEC-V2 | Task |
|---|---|
| V1 toast / W1 | 8 |
| V2 sidebar lipat / W2 | 6 |
| V3 shape | 4 |
| V4 page PPT / W4 W5 W6 | 2, 6 |
| V5 cover / §4 | 3, 6, 9 |
| V6 font / W9 W10 | 5, 9 |
| V7 clipboard / W7 W8 | 7 |
| V8 V10 layout & PageSheet editable | 6 |
| V9 teks page hanya tampilan | 6 |
| W3 zoom | 6 |
| W11 migrasi | 1 |
| W12 thumbnail | 6 |
| §6 error handling | 5, 7, 9 |
