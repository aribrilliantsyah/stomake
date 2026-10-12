# Storyboard Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app lokal untuk membuat storyboard 9:16 (page berisi 1–3 scene, nomor scene berlanjut) dari storyline, dengan drag & drop asset, lalu export PDF bergaya template Canva.

**Architecture:** Satu package pnpm. `src/shared` berisi tipe, schema, operasi model murni, dan konstanta layout, dipakai server dan web. `src/server` (Hono di Node) membaca/menulis folder `~/Storyboard` dan mencetak PDF lewat Playwright Chromium dari route print web. `src/web` (Vite + React + react-konva + zustand) berisi daftar project, editor, dan halaman print.

**Tech Stack:** TypeScript, pnpm, Vite, React 19, react-konva/konva, zustand, zod, Hono + @hono/node-server, mammoth, image-size, playwright (chromium), @fontsource/coming-soon, @fontsource/bangers, @fontsource/inter, Vitest.

**Spec:** `docs/SPEC.md`

## Global Constraints

- Package manager: pnpm saja (tanpa npm/yarn lockfile).
- Server bind ke `127.0.0.1:5178`; Vite dev `5173`, proxy `/api` dan `/files` ke 5178.
- Root data: `process.env.STORYBOARD_HOME ?? ~/Storyboard`.
- Page PDF 708.75 × 567 pt; frame 9:16; ruang koordinat panel 1080×1920 (split: 1080×960).
- Default page background `#D4BFB3`, default panel background `#FFFFFF`.
- Scene per page 1..3; nomor scene dihitung, tidak disimpan.
- Format asset: png, jpg, jpeg, gif, webp.
- UI compact, border 1px, tanpa gradient/glow/kartu bulat besar.
- Commit setiap task selesai (user minta tidak ada perubahan yang dibiarkan uncommitted).

## Review Focus

- Storyline atau subtitle sangat panjang (paragraf penuh di satu scene): PDF tetap rapi, teks mengecil sampai 8pt lalu `…`, tidak menimpa garis brush. → test di Task 9.
- Nama file asset berspasi / non-ASCII (`dont .png`, `todoroki selimutan kain basah.png`): upload, URL, render, dan export berhasil. → test di Task 3 dan Task 10.
- Asset dihapus dari disk setelah dipakai: editor dan export tidak crash, `missingAssets` terisi. → test di Task 10.
- Menghapus scene di tengah: penomoran berikutnya bergeser rapi dan page kosong hilang. → test di Task 1.
- PNG besar 2295×4080 berulang di 20+ scene: editor tetap responsif (gambar di-cache per URL, satu `HTMLImageElement` per asset). → test di Task 6.

---

## File Structure

```
package.json  tsconfig.json  vite.config.ts  vitest.config.ts  index.html  README.md
src/shared/types.ts        tipe §4 SPEC
src/shared/schema.ts       zod schema Project + parseProject()
src/shared/model.ts        operasi murni pada Project
src/shared/layout.ts       konstanta & fungsi layout page PDF
src/shared/ids.ts          newId()
src/server/paths.ts        root, slugify, safeName, path project/asset
src/server/store.ts        baca/tulis project & storyline (atomik)
src/server/assets.ts       list/simpan asset, uniqueName
src/server/export.ts       Playwright print → PDF
src/server/app.ts          Hono routes
src/server/main.ts         listen 127.0.0.1:5178
src/web/main.tsx  App.tsx  api.ts  styles.css
src/web/state/editorStore.ts   zustand: project, selection, undo, autosave
src/web/state/imageCache.ts    useAssetImage(ref)
src/web/projects/ProjectList.tsx
src/web/editor/Editor.tsx  Toolbar.tsx  PageStrip.tsx  SceneCanvas.tsx  LayerNode.tsx
src/web/editor/StorylinePanel.tsx  AssetPanel.tsx  PropsPanel.tsx
src/web/print/PageSheet.tsx  PrintRoute.tsx  BrushLine.tsx
tests/*.test.ts  e2e/export.spec.ts
```

Routing (tanpa library): `/` daftar project, `/p/:slug` editor, `/print/:slug` semua page untuk dicetak, `/print/:slug?page=N` satu page (preview).

---

### Task 1: Scaffold + shared model

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/shared/{types,schema,model,ids}.ts`
- Test: `tests/model.test.ts`, `tests/schema.test.ts`

**Interfaces:**
- Produces (`src/shared/model.ts`, semua murni, mengembalikan Project baru):
  - `createProject(name: string, now: string): Project` → 1 page, 1 scene kosong
  - `sceneNumber(p: Project, sceneId: string): number` (1-based)
  - `flatScenes(p: Project): { scene: Scene; pageIndex: number; number: number }[]`
  - `addSceneAfter(p: Project, sceneId: string): { project: Project; sceneId: string }`
  - `duplicateScene(p: Project, sceneId: string): { project: Project; sceneId: string }` (id baru untuk scene, panel, layer)
  - `removeScene(p: Project, sceneId: string): Project`
  - `moveScene(p: Project, sceneId: string, dir: -1 | 1): Project`
  - `setSplit(p: Project, sceneId: string, split: boolean): Project`
  - `updateScene(p, sceneId, patch: Partial<Pick<Scene,'note'|'subtitle'>>): Project`
  - `updatePanel(p, panelId, fn: (panel: Panel) => Panel): Project`
  - `findPanel(p, panelId): { panel: Panel; scene: Scene } | null`
- Produces (`schema.ts`): `projectSchema`, `parseProject(x: unknown): Project` (lempar `ZodError`)
- Produces (`ids.ts`): `newId(): string` (crypto.randomUUID)

- [ ] **Step 1: Init repo & deps**

`git init`; `pnpm init`; `pnpm add react react-dom konva react-konva zustand zod hono @hono/node-server mammoth image-size playwright @fontsource/coming-soon @fontsource/bangers @fontsource/inter`; `pnpm add -D typescript vite @vitejs/plugin-react vitest tsx @types/react @types/react-dom @types/node concurrently`. Scripts: `dev` = concurrently `tsx watch src/server/main.ts` + `vite`; `test` = `vitest run`; `build` = `vite build`; `start` = `tsx src/server/main.ts` (melayani `dist/`). `.gitignore`: `node_modules dist test-results`.

- [ ] **Step 2: Write failing tests**

```ts
// tests/model.test.ts
const P = () => createProject('Selimut Darurat', '2026-10-12T00:00:00Z');
test('project baru: 1 page 1 scene, bg default', () => {
  const p = P();
  expect(p.pages).toHaveLength(1);
  expect(p.pages[0].scenes).toHaveLength(1);
  expect(p.pageBackground).toEqual({ kind: 'color', color: '#D4BFB3' });
  expect(p.pages[0].scenes[0].panels[0].background).toEqual({ kind: 'color', color: '#FFFFFF' });
});
test('scene ke-4 membuat page baru, nomor berlanjut', () => {
  let p = P(); let id = p.pages[0].scenes[0].id;
  for (let i = 0; i < 3; i++) ({ project: p, sceneId: id } = addSceneAfter(p, id));
  expect(p.pages.map(pg => pg.scenes.length)).toEqual([3, 1]);
  expect(sceneNumber(p, id)).toBe(4);
});
test('add di page penuh yang bukan terakhir menyisipkan page setelahnya', () => {
  // 6 scene [3,3], addSceneAfter(scene 2) → page 1 = [1,2,baru,3] > 3,
  // scene lama ke-3 pindah ke page baru setelah page 1 → [3,1,3]; scene baru bernomor 3.
  expect(p.pages.map(pg => pg.scenes.length)).toEqual([3, 1, 3]);
  expect(flatScenes(p).map(s => s.number)).toEqual([1,2,3,4,5,6,7]);
});
test('hapus scene tengah: nomor bergeser, page kosong hilang', () => {
  // pages [3,1] → hapus scene 4 → pages [3]; pages [3,3] → hapus scene 2 → [2,3], nomor 1..5
});
test('hapus satu-satunya scene tidak menghapus page terakhir', () => {
  const p = P(); const q = removeScene(p, p.pages[0].scenes[0].id);
  expect(q.pages).toHaveLength(1); expect(q.pages[0].scenes).toHaveLength(1);
});
test('duplicateScene menyalin layer dengan id baru, tepat setelah sumber', () => { ... });
test('moveScene lintas page', () => { /* scene 3 move +1 → menjadi scene 4 di page 2 */ });
test('setSplit true → 2 panel, panel kedua salinan panel pertama; false → 1 panel', () => { ... });
```

```ts
// tests/schema.test.ts
test('parseProject menerima createProject', () => expect(() => parseProject(P())).not.toThrow());
test('menolak page dengan 4 scene', ...);
test('menolak split=true dengan 1 panel', ...);
test('menolak ref asset tanpa prefix global:/project:', ...);
```

Aturan penempatan (algoritma yang tidak ditentukan signature): operasi tambah/pindah bekerja pada urutan datar scene lalu **reflow hanya page yang terdampak**: jika page target > 3 scene, scene terakhir page itu dipindah ke page baru yang disisipkan tepat setelahnya (bukan didorong berantai ke page berikutnya). Page dengan 0 scene dihapus, kecuali itu satu-satunya page (maka diisi 1 scene kosong).

- [ ] **Step 3: Run** `pnpm test` → FAIL (modul belum ada)
- [ ] **Step 4: Implement** `types.ts` (salin §4 SPEC), `schema.ts`, `ids.ts`, `model.ts`
- [ ] **Step 5: Run** `pnpm test` → PASS
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat(shared): project model, schema, scene numbering"`

---

### Task 2: Layout page PDF

**Files:**
- Create: `src/shared/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Produces:
  - `PAGE = { w: 708.75, h: 567 }`, `FRAME = { w: 144, h: 256, y: 128 }`, `COL_PITCH = 228`, `TITLE`, `LABEL_Y = 94`, `NOTE = { y: 108, size: 7, width: 200, maxLines: 2 }`, `SUB = { y: 390, size: 11, minSize: 8, width: 200, maxLines: 4 }`, `BRUSH = { y: 470, width: 180 }`
  - `columnXs(n: 1 | 2 | 3): number[]`
  - `panelRect(split: boolean, index: 0 | 1): { x: number; y: number; w: number; h: number }` dalam koordinat frame (pt)
  - `PANEL_SPACE = { w: 1080, h: 1920 }`, `panelSpace(split): { w: 1080; h: 1920 | 960 }`

- [ ] **Step 1: Failing test**

```ts
expect(columnXs(3)).toEqual([35, 263, 491]);
expect(columnXs(2)).toEqual([149, 377]);
expect(columnXs(1)).toEqual([263]);
expect(FRAME.h / FRAME.w).toBeCloseTo(16 / 9, 2);
expect(panelRect(true, 1)).toEqual({ x: 0, y: 128, w: 144, h: 128 });
expect(panelSpace(true)).toEqual({ w: 1080, h: 960 });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(shared): pdf page layout constants`

---

### Task 3: Server storage, project & storyline API

**Files:**
- Create: `src/server/{paths,store,app,main}.ts`
- Test: `tests/server-projects.test.ts`

**Interfaces:**
- Consumes: `createProject`, `parseProject` (Task 1)
- Produces:
  - `dataRoot(): string`; `slugify(name: string): string`; `isSafeName(name: string): boolean`; `projectDir(slug)`, `assetPath(ref: AssetRef, slug: string): string`
  - `createApp(): Hono` (dipakai test via `app.request`)
  - Endpoint `/api/projects*` dan `/storyline` persis §7 SPEC

- [ ] **Step 1: Failing tests** (setiap test `STORYBOARD_HOME` = `fs.mkdtempSync`)

```ts
test('POST lalu GET project', async () => {
  const r = await app.request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Selimut Darurat' }), headers: {'content-type':'application/json'} });
  expect(await r.json()).toEqual({ slug: 'selimut-darurat' });
  expect(existsSync(join(home, 'projects/selimut-darurat/assets'))).toBe(true);
  const p = await (await app.request('/api/projects/selimut-darurat')).json();
  expect(p.pages[0].scenes).toHaveLength(1);
});
test('nama bentrok → slug -2', ...);
test('PUT body invalid → 400 dan file lama utuh', ...);
test('PUT valid memperbarui updatedAt, tidak ada .tmp tersisa', ...);
test('slug ../etc → 400', ...);
test('GET daftar urut updatedAt terbaru', ...);
test('storyline PUT/GET roundtrip; default ""', ...);
test('isSafeName: "dont .png" true; "../a.png", ".x", "a/b" false', ...);
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (tulis atomik `project.json.tmp` → `rename`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): project storage and api`

---

### Task 4: Asset & docx import API

**Files:**
- Create: `src/server/assets.ts`; Modify: `src/server/app.ts`
- Test: `tests/server-assets.test.ts`, fixture `tests/fixtures/{red.png,storyline.docx}` (docx: salin dari `~/Videos/Konten/Nah Jadi/selimut darurat/cara kerja selimut darurat.docx`)

**Interfaces:**
- Produces: `uniqueName(dir: string, name: string): string`; `listAssets(slug?: string): Promise<{ project: AssetInfo[]; global: AssetInfo[] }>`; endpoint asset, `/files/*`, `/storyline/import` sesuai §7 SPEC. `url` di AssetInfo memakai `encodeURIComponent` untuk nama.

- [ ] **Step 1: Failing tests**

```ts
test('upload global "dont .png" → listed dengan width/height, url ter-encode', ...); // url '/files/global/dont%20.png'
test('upload "todoroki.png" dua kali → kedua bernama "todoroki (2).png"', ...);
test('ekstensi .svg/.exe ditolak 400', ...);
test('GET /files/project/:slug/:name mengembalikan bytes & content-type image/png', ...);
test('import docx → text mengandung "kenapa orang yang hipotermia" dan tersimpan di storyline.txt', ...);
```

Aturan `uniqueName`: `base + ' (n)' + ext`, n mulai 2.

- [ ] **Step 2–4:** Run FAIL → implement (`image-size` untuk dimensi, `mammoth.extractRawText`) → Run PASS.
- [ ] **Step 5: Commit** `feat(server): asset library and docx import`

---

### Task 5: Web shell, project list, editor store

**Files:**
- Create: `index.html`, `vite.config.ts`, `src/web/{main.tsx,App.tsx,api.ts,styles.css}`, `src/web/projects/ProjectList.tsx`, `src/web/state/editorStore.ts`
- Test: `tests/editorStore.test.ts`

**Interfaces:**
- Consumes: API Task 3–4, model Task 1
- Produces (`useEditor` zustand):
  - state: `project: Project | null`, `slug`, `currentSceneId`, `selectedLayerId: string | null`, `activePanelId`, `saveStatus: 'saved' | 'saving' | 'dirty' | 'error'`
  - actions: `load(slug)`, `apply(fn: (p: Project) => Project, opts?: { coalesceKey?: string })`, `undo()`, `redo()`, `selectScene(id)`, `selectLayer(id | null)`, `setActivePanel(id)`
  - `apply` mendorong ke history (maks 100); panggilan berturut-turut dengan `coalesceKey` sama dalam 500 ms digabung jadi satu langkah (untuk drag & ketik).
  - autosave: debounce 1500 ms → `api.saveProject`; gagal → `saveStatus='error'`, retry tiap 5000 ms.
- `api.ts`: fungsi tipis per endpoint §7.

- [ ] **Step 1: Failing tests** (fake timers, `api` di-mock)

```ts
test('apply lalu undo/redo', ...);
test('history dibatasi 100', ...);
test('coalesceKey menggabungkan perubahan dalam 500ms', ...);
test('autosave dipanggil sekali 1500ms setelah perubahan terakhir', ...);
test('save gagal → status error, retry setelah 5000ms → saved', ...);
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Manual check:** `pnpm dev`, buka `http://localhost:5173`, buat "Selimut Darurat" → masuk `/p/selimut-darurat`, folder muncul di `~/Storyboard/projects/`.
- [ ] **Step 6: Commit** `feat(web): shell, project list, editor store`

---

### Task 6: Scene canvas & page strip

**Files:**
- Create: `src/web/editor/{Editor,Toolbar,PageStrip,SceneCanvas,LayerNode}.tsx`, `src/web/state/imageCache.ts`
- Test: `tests/imageCache.test.ts`

**Interfaces:**
- Consumes: `useEditor`, `panelSpace`, `flatScenes`, `addSceneAfter`, `duplicateScene`, `removeScene`, `moveScene`
- Produces:
  - `useAssetImage(ref: AssetRef | null, slug: string): { image: HTMLImageElement | null; status: 'loading' | 'ok' | 'missing' }` (cache module-level `Map<url, Promise>`)
  - `<SceneCanvas sceneId width interactive />` dipakai ulang oleh PageSheet (Task 9) dengan `interactive={false}`; panel digambar berdasar `panelRect`, ruang koordinat via scale `width / 1080`.
  - `<LayerNode layer interactive onChange />` merender image (flip lewat scaleX/Y negatif), text (Konva.Text, `fontFamily`, stroke), arrow (Konva.Arrow), emoji (Konva.Text). Asset `missing` → Rect abu-abu bergaris + nama file.

- [ ] **Step 1: Failing test**

```ts
test('url yang sama hanya dimuat sekali', ...);   // 25 panggilan, 1 Image dibuat
test('error load → status missing', ...);
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Implement editor UI** sesuai wireframe §6 SPEC: PageStrip menampilkan page dengan nomor scene; tombol `+ Scene` (addSceneAfter current), `Duplikat`, `Hapus`, `←/→` (moveScene); Transformer pada layer terpilih (`apply` dengan `coalesceKey = 'xf:'+layerId`); shortcut Delete, Ctrl+D, Ctrl+Z, Ctrl+Shift+Z, `[`/`]`. Shortcut diabaikan saat fokus di input/textarea.
- [ ] **Step 6: Manual check:** tambah 4 scene → strip menampilkan P1[1 2 3] P2[4]; hapus scene 2 → P1[1 2 3] (nomor bergeser).
- [ ] **Step 7: Commit** `feat(web): scene canvas, page strip, transforms`

---

### Task 7: Asset panel, drag & drop, background

**Files:**
- Create: `src/web/editor/AssetPanel.tsx`; Modify: `SceneCanvas.tsx`
- Test: `tests/dropLayer.test.ts`

**Interfaces:**
- Produces: `layerFromDrop(info: AssetInfo, dropX: number, dropY: number, space: {w:number;h:number}): ImageLayer` di `src/shared/model.ts` → lebar = 0.6 × space.w, tinggi mengikuti rasio asset, pusat di titik drop.

- [ ] **Step 1: Failing test**

```ts
expect(layerFromDrop({ref:'project:todoroki.png', width:2295, height:4080, ...}, 540, 960, {w:1080,h:1920}))
  .toMatchObject({ type:'image', x:540, y:960, width:648, height:1152, rotation:0, opacity:1, flipX:false, flipY:false });
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Implement UI:** tab Project/Global, filter nama, grid thumbnail; upload via tombol & drop file OS (`dataTransfer.files`) ke panel; drag thumbnail (`dataTransfer.setData('application/x-asset', ref)`) ke canvas → konversi posisi layar ke ruang panel aktif, `apply(addLayer)`. Menu thumbnail: "Background panel" (cover) dan "Background page". Dialog warna untuk background panel/page di PropsPanel (Task 8).
- [ ] **Step 6: Manual check:** upload folder `img/` selimut darurat ke project, drag `todoroki.png` ke scene, set `bg gunung.jpg` sebagai background.
- [ ] **Step 7: Commit** `feat(web): asset library panel and drag-drop`

---

### Task 8: Storyline panel, props panel, tool teks/panah/emoji

**Files:**
- Create: `src/web/editor/{StorylinePanel,PropsPanel}.tsx`; Modify: `Toolbar.tsx`, `src/shared/model.ts`
- Test: `tests/layers.test.ts`

**Interfaces:**
- Produces (model): `addLayer(p, panelId, layer: Layer): Project`, `updateLayer(p, panelId, layerId, patch: Partial<Layer>): Project`, `removeLayer(p, panelId, layerId)`, `reorderLayer(p, panelId, layerId, dir: 'up'|'down'|'top'|'bottom')`, `defaultText(): TextLayer` (`'TEKS'`, Bangers, 120, `#000000`, stroke `#FFFFFF`, 8), `defaultArrow(): ArrowLayer` (`points [0,0,0,-300]`, 18, `#000000`), `defaultEmoji(char): EmojiLayer` (size 200). Semua default di tengah panel.

- [ ] **Step 1: Failing tests:** reorder top/bottom/up/down; updateLayer tidak mengubah layer lain; removeLayer pada layer terpilih.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Implement UI:**
  - StorylinePanel: textarea monospace bisa diedit (simpan via PUT debounce 1000 ms), tombol Import .docx, teks bisa diblok & copy.
  - PropsPanel: catatan efek & subtitle (textarea, `coalesceKey` per field), toggle Split, background panel aktif (warna / asset / hapus), background page, properti layer terpilih (x, y, rotasi, opacity, flip; text: isi/font/ukuran/warna/outline; arrow: tebal/warna; emoji: karakter/ukuran), daftar layer dengan tombol naik/turun.
  - Toolbar: tombol T (teks), → (panah), 😀 (pilihan 🔥❄️💧❌✅❓❗😱).
- [ ] **Step 6: Manual check:** reproduksi Scene 3 selimut darurat (bg gunung, todoroki selimutan, panah ke atas, catatan, subtitle).
- [ ] **Step 7: Commit** `feat(web): storyline viewer, properties, text/arrow/emoji tools`

---

### Task 9: Page sheet (preview & print)

**Files:**
- Create: `src/web/print/{PageSheet,PrintRoute,BrushLine}.tsx`; Modify: `App.tsx`, `Toolbar.tsx`
- Test: `tests/fitText.test.ts`

**Interfaces:**
- Consumes: `layout.ts`, `SceneCanvas`
- Produces:
  - `fitText(text: string, opts: { width: number; maxLines: number; size: number; minSize: number; measure: (s: string, size: number) => number }): { size: number; lines: string[] }`, di `src/shared/layout.ts`: turunkan ukuran 0.5pt per langkah sampai muat; di minSize, potong baris terakhir dan tambah `…`.
  - `<PageSheet project pageIndex />`: elemen 708.75pt × 567pt, background page, judul "STORYBOARD" (Coming Soon 30pt, tengah), kolom di `columnXs(n)`, label "Scene N", catatan (`-` jika kosong), frame (SceneCanvas non-interaktif, pixelRatio 4) dengan border BrushLine, subtitle via fitText, garis BrushLine.
  - `BrushLine`: SVG path hitam berujung meruncing (tidak perlu persis Canva).
  - Route `/print/:slug` merender semua page dengan CSS `@page { size: 708.75pt 567pt; margin: 0 }` dan `page-break-after: always`; set `window.__PRINT_READY__ = true` setelah semua font (`document.fonts.ready`) dan gambar selesai/missing.
  - Tombol "Preview Page" membuka `/print/:slug?page=N` di tab baru.

- [ ] **Step 1: Failing tests**

```ts
const measure = (s: string, size: number) => s.length * size * 0.5;
test('teks pendek tetap 11pt, 1 baris', ...);
test('teks panjang mengecil tapi tidak < 8pt', ...);
test('teks sangat panjang → maxLines baris, baris terakhir diakhiri "…"', ...);
test('string kosong → lines [] size 11', ...);
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Manual check:** preview page 1 dan bandingkan dengan `selimut darurat/storyboard.pdf` halaman 2 (posisi label, frame, subtitle).
- [ ] **Step 6: Commit** `feat(web): print page sheet and preview`

---

### Task 10: Export PDF + E2E

**Files:**
- Create: `src/server/export.ts`, `e2e/export.spec.ts`, `playwright.config.ts`, `README.md`; Modify: `src/server/app.ts`, `Toolbar.tsx`, `package.json`
- Test: `tests/export.test.ts`, `e2e/export.spec.ts`

**Interfaces:**
- Produces: `exportPdf(slug: string, baseUrl: string): Promise<{ path: string; missingAssets: string[] }>`: launch chromium, buka `${baseUrl}/print/${slug}`, tunggu `window.__PRINT_READY__` (timeout 120000), baca `window.__MISSING_ASSETS__`, `page.pdf({ width: '708.75pt', height: '567pt', printBackground: true })`, tulis ke `exports/storyboard.pdf`. `baseUrl` = server sendiri (mode start) atau `http://localhost:5173` (dev, dari env `STORYBOARD_WEB_URL`).
- Script: `postinstall` tidak dipakai; README menyebut `pnpm exec playwright install chromium` sekali.

- [ ] **Step 1: Failing tests**

```ts
// tests/export.test.ts (butuh chromium; skip bila tidak terinstall)
test('project 4 scene → PDF 2 halaman, ukuran 708.75x567, teks Scene 4 di halaman 2', ...); // cek via `pdfinfo` & `pdftotext -f 2 -l 2`
test('subtitle "kenapa orang yang hipotermia" ada di pdftotext halaman 1', ...);
test('asset hilang → export sukses, missingAssets ["project:hilang.png"]', ...);
test('asset "dont .png" ter-render (missingAssets kosong)', ...);
```

- [ ] **Step 2: Run** `pnpm test tests/export.test.ts` → FAIL
- [ ] **Step 3: Implement** export + tombol Export PDF (toast hasil, peringatan missing assets, link unduh `/api/projects/:slug/export.pdf`).
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: E2E** `e2e/export.spec.ts`: buat project via UI, tambah 3 scene, isi subtitle scene 4, klik Export → respons sukses. Run `pnpm exec playwright test` → PASS.
- [ ] **Step 6: Final check:** `pnpm test && pnpm build`; buat ulang storyboard selimut darurat scene 1–6 dengan aset asli, export, bandingkan visual dengan PDF Canva.
- [ ] **Step 7: Commit** `feat: pdf export and e2e`

---

## Spec coverage

| SPEC | Task |
|---|---|
| §2 D1 export PDF | 9, 10 |
| D2 storyline viewer + import docx | 4, 8 |
| D3 asset project + global | 4, 7 |
| D4 page 1–3 scene, nomor berlanjut, mulai tengah | 1, 2, 6, 9 |
| D5 kolom scene | 8, 9 |
| D6 background page & panel | 7, 8, 9 |
| D7 drag & drop | 7 |
| D8/U4 folder lokal | 3 |
| U1 split | 1, 2, 8 |
| U2 tools | 6, 8 |
| U5 font | 8, 9 |
| U7 GIF statis | 6 (Konva Image memakai frame pertama) |
| U8 autosave/undo | 5 |
| U9 reflow page | 1 |
| U10 nama unik | 4 |
| §8 error handling | 5, 6, 10 |
