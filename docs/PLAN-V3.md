# Storyboard Maker V3 (MCP + Dark Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent AI bisa menggerakkan Storyboard Maker lewat MCP HTTP lokal (dinyalakan di Pengaturan), perubahan agent tampil live di editor yang terkunci selama agent bekerja, dan UI punya mode gelap.

**Architecture:**
- Server menambah tiga modul:
  - `settings.ts`: file `~/Storyboard/settings.json`.
  - `live.ts`: penulisan project.json diserialkan per slug, kunci agent, bus event SSE.
  - `mcp/`: definisi tool murni di atas `store` + `shared/model`, plus route `/mcp` stateless memakai `WebStandardStreamableHTTPServerTransport` dari `@modelcontextprotocol/sdk`.
- Editor berlangganan `GET /api/projects/:slug/events` (SSE). Event `project` masuk ke riwayat undo tanpa autosave. Flag `agentActive` memblokir semua aksi edit.
- Tema memakai CSS variable dengan `data-theme` di `<html>`, diset oleh script inline sebelum render.

**Tech Stack:** stack yang ada (TypeScript, pnpm, Vite, React 19, react-konva, zustand, zod 4, Hono 4, Playwright, vitest), ditambah `@modelcontextprotocol/sdk@^1.32.1`. Spike di /tmp sudah membuktikan `registerTool` + transport web-standard + `Client`/`StreamableHTTPClientTransport` jalan di Hono dengan zod 4.

**Spec:** `docs/SPEC-V3.md` (di atas `docs/SPEC.md`, `docs/SPEC-V2.md`)

## Global Constraints

- pnpm saja. Satu dependency baru: `@modelcontextprotocol/sdk`. Commit di akhir setiap task.
- MCP default **mati**. Saat mati, `/mcp` → 404 `{ error: "MCP nonaktif. Nyalakan di Pengaturan." }`. Setelan berlaku tanpa restart.
- `/mcp` menolak `Host` selain `127.0.0.1:<port>` / `localhost:<port>` (403). Origin non-lokal → 403.
- Agent tidak punya tool hapus/arsip/rename/duplikat project maupun upload.
- Kunci agent: lepas lewat `finish_editing` atau 10 000 ms setelah tool terakhir. Tunggu ack editor maksimal 3 000 ms.
- Saat kunci aktif: PUT project/storyline dari editor → 423 `{ error: "AI sedang mengedit project ini" }`. DELETE, archive, rename, dan bulk untuk slug itu → 423.
- Pesan error tool berbahasa Indonesia, dikembalikan sebagai `isError: true`. Project tidak berubah bila tool gagal.
- Tema: localStorage `sb.theme` ∈ `light | dark | system`, default `system`. Palet gelap persis §5 SPEC-V3. Isi storyboard (page, frame, canvas, thumbnail, PDF, `/print`) tidak ikut gelap.
- UI compact, border 1px, tanpa gradient/glow. Angka monospace.

## Review Focus

- Editor punya edit belum tersimpan saat agent mulai: edit itu tersimpan dulu (flush + ack) sebelum tool jalan, tidak hilang dan tidak menimpa hasil agent. → test di Task 2 (server) dan Task 5 (editor).
- Tidak ada editor yang terbuka, atau tab tidak membalas ack: tool tetap jalan setelah ≤ 3 detik, tidak menggantung. → test di Task 2.
- Agent memanggil tool dengan id salah, atau page sudah penuh: hasil `isError` dengan pesan jelas, project.json tidak berubah byte-nya. → test di Task 3.
- MCP dimatikan saat agent sedang bekerja: panggilan berikutnya 404, kunci tetap lepas sendiri dalam 10 detik, editor terbuka kembali. → test di Task 4.
- User menekan Ctrl+Z setelah agent selesai: perubahan agent dibatalkan satu per satu dan hasil undo tersimpan ke disk. Selama agent aktif, Ctrl+Z tidak berbuat apa-apa. → test di Task 5.

---

### Task 1: Settings server

**Files:**
- Create: `src/server/settings.ts`
- Modify: `src/server/paths.ts` (tambah `settingsFile()`), `src/server/app.ts` (route), `src/shared/types.ts`
- Test: `tests/server-settings.test.ts`

**Interfaces:**
- Produces:
  - `interface Settings { mcp: { enabled: boolean } }`
  - `interface SettingsView { mcp: { enabled: boolean; url: string; lastCallAt: string | null } }` (di `shared/types.ts`)
  - `readSettings(): Promise<Settings>`, `writeSettings(s: Settings): Promise<void>`
  - `isMcpEnabled(): Promise<boolean>` di-cache dan diinvalidasi saat `writeSettings`
  - `noteMcpCall(): void`, `lastMcpCallAt(): string | null` (hanya di memori)
  - `createApp({ port? })`: `port` dipakai untuk `url`, default 5178.

- [ ] **Step 1: Tulis test yang gagal**
  - `GET /api/settings` di home baru → `{ mcp: { enabled: false, url: 'http://127.0.0.1:5178/mcp', lastCallAt: null } }`.
  - `PUT {mcp:{enabled:true}}` → 200 dengan `enabled: true`, file `settings.json` berisi `{"mcp":{"enabled":true}}`, GET berikutnya `true`.
  - `PUT {mcp:{enabled:"ya"}}` dan `PUT {}` → 400.
  - `settings.json` berisi `{oops` → GET tetap default, tidak 500.
  - PUT dengan `origin: http://evil.com` → 403 (guard yang ada).
- [ ] **Step 2:** `pnpm vitest run tests/server-settings.test.ts`. Expected: FAIL (404).
- [ ] **Step 3:** Implementasi. Zod schema `{ mcp: { enabled: z.boolean() } }`, tulis atomik seperti `writeAtomic` di store.
- [ ] **Step 4:** Test PASS, lalu `pnpm exec tsc --noEmit -p .` bersih.
- [ ] **Step 5:** Commit `feat(server): settings.json + /api/settings`.

### Task 2: Penulisan berseri, kunci agent, dan SSE

**Files:**
- Create: `src/server/live.ts`
- Modify:
  - `src/server/store.ts`: semua penulisan project.json/storyline lewat `withWriteLock`.
  - `src/server/app.ts`: 423 saat kunci aktif, route events + ack, `agentActive` di summary.
  - `src/shared/types.ts`: `ProjectSummary.agentActive: boolean`.
- Test: `tests/server-live.test.ts`

**Interfaces:**
- Produces (semua dari `live.ts`):
  - `withWriteLock<T>(slug: string, fn: () => Promise<T>): Promise<T>`: antrean promise per slug.
  - `type LiveEvent = { type: 'hello'; clientId: string; agent: { active: boolean; since: string | null } } | { type: 'agent'; active: boolean; since: string | null } | { type: 'project'; project: Project } | { type: 'storyline'; text: string }`
  - `subscribe(slug, send: (e: LiveEvent) => void): { clientId: string; close(): void }`
  - `publish(slug, e: LiveEvent): void`
  - `agentLock`:
    - `beginOrExtend(slug): Promise<void>`: kunci baru → status `pending`, kirim `agent{active:true}`, tunggu ack semua klien yang terhubung saat itu (maks `ACK_TIMEOUT_MS = 3000`), lalu status `active`. Kunci yang sudah ada → perpanjang timer `IDLE_RELEASE_MS = 10000`.
    - `ack(slug, clientId): void`
    - `release(slug): void`: kirim `agent{active:false}`
    - `state(slug): 'none' | 'pending' | 'active'`
    - `since(slug): string | null`
  - Konstanta `ACK_TIMEOUT_MS` dan `IDLE_RELEASE_MS` di-export dan bisa di-override untuk test lewat `setLiveTimings({ ack, idle })`.
- Aturan 423: hanya saat `state === 'active'`. Saat `pending`, PUT editor (flush) masih diterima.

- [ ] **Step 1: Tulis test yang gagal**, dengan `setLiveTimings({ ack: 200, idle: 300 })`.
  - `withWriteLock`: dua fungsi untuk slug sama berjalan berurutan (log `['a1','a2','b1','b2']`); slug berbeda berjalan paralel.
  - `subscribe` + `beginOrExtend` tanpa ack → resolve setelah ≥ 200 ms dan < 1000 ms. Klien menerima `{type:'agent',active:true}`.
  - Dengan ack segera dari klien → resolve < 100 ms.
  - Saat `pending`, `PUT /api/projects/:slug` → 200. Saat `active` → 423 dengan pesan persis. `DELETE`, `/archive`, `/rename`, `PUT /storyline` → 423.
  - Setelah idle 300 ms → `state` jadi `none`, klien menerima `agent{active:false}`, PUT → 200.
  - `GET /api/projects/:slug/events` (baca stream lewat `app.request`): baris pertama `data:` berisi `type:"hello"` dan `clientId`. `publish` → event berikutnya diterima.
  - `POST /api/projects/:slug/agent-ack {clientId}` memanggil `agentLock.ack`; clientId tak dikenal → 200 tanpa efek.
  - `GET /api/projects` → item yang terkunci punya `agentActive: true`.
- [ ] **Step 2:** `pnpm vitest run tests/server-live.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementasi.
  - SSE memakai `streamSSE` dari `hono/streaming` dengan keep-alive `: ping` tiap 15 s. `close()` dipanggil saat `stream.onAbort`.
  - `saveProject` / `writeStoryline` / `setArchived` / `renameProject` / `trashProject` dibungkus `withWriteLock`.
- [ ] **Step 4:** Test PASS, lalu seluruh suite `pnpm test` hijau (server-projects/home tidak regresi).
- [ ] **Step 5:** Commit `feat(server): per-slug write queue, agent lock, SSE events`.

### Task 3: Operasi agent (tanpa transport)

**Files:**
- Create:
  - `src/server/mcp/ops.ts`: satu fungsi per tool.
  - `src/server/mcp/layerSpec.ts`: konversi input layer → `Layer`.
- Modify: `src/shared/model.ts` hanya bila perlu helper murni baru (mis. `projectOutline`)
- Test: `tests/mcp-ops.test.ts`

**Interfaces:**
- Consumes: `withWriteLock`, `agentLock.beginOrExtend`, `publish` (Task 2); `store.*`; `model.*`; `exportPdf` dari `export.ts`.
- Produces:
  - `class ToolError extends Error`: pesan untuk agent.
  - `ops`: objek yang tiap anggotanya `(input) => Promise<output>`, dengan nama dan bentuk persis tabel §3.1 SPEC-V3 (`listProjects`, `createProject`, `getProject`, `getStoryline`, `setStoryline`, `listAssets`, `addPage`, `addScene`, `removeScene`, `removePage`, `updateScene`, `setCover`, `setBackground`, `addLayer`, `updateLayer`, `removeLayer`, `reorderLayer`, `exportPdf`, `finishEditing`).
  - `mutate(slug, fn: (p: Project) => Project | { project: Project; result: R }): Promise<R>`: helper internal untuk semua op yang mengubah project. Urutannya:
    1. `agentLock.beginOrExtend`
    2. `withWriteLock`: baca → `fn` → `parseProject` → tulis
    3. `publish({type:'project'})`
    4. `noteMcpCall()`
  - `layerFromSpec(spec, space, assets): Layer` dengan default dari §3.1 (tengah panel; image 60% lebar panel dengan rasio asset; text/shape/emoji sama `defaultText`/`defaultShape`/`defaultEmoji`; `opacity` 0–100 → 0–1).
  - `getProject` mengembalikan outline: layer diringkas jadi `{id,type,x,y,width?,height?,text?,shape?,char?,ref?,opacity}`.

- [ ] **Step 1: Tulis test yang gagal** (home tmp, timings kecil).
  - `createProject({name:'Kipas'})` → `{slug:'kipas'}`. `getProject` → 1 page, 1 scene `number:1`, `cover:null`.
  - `addPage({slug, scenes:3})` → `sceneIds.length===3`. `getProject` menomori scene 1..4.
  - `addScene` pada page penuh → `ToolError('Page sudah berisi 3 scene')`, dan isi `project.json` identik sebelum/sesudah (bandingkan string).
  - `updateScene({note:'zoom in', subtitle:'halo'})` tersimpan. `sceneId` tak dikenal → `ToolError` berisi `'Scene tidak ditemukan'`.
  - `addLayer` image dengan `assetRef:'project:dont.png'` (fixture 200×100) tanpa x/y/width → `x:540,y:960,width:648,height:324`. `assetRef` tak ada → `ToolError('Asset tidak ditemukan: project:dont.png')`.
  - `addLayer` text, shape `star`, dan emoji → tipe benar. `opacity:50` → `0.5`. `shape:'hexagon'` → error validasi.
  - `updateLayer` patch `x` → tersimpan. `reorderLayer to:'top'` → urutan berubah. `removeLayer` → hilang.
  - `setBackground({target:{pageId}, color:'#000000'})`, `{target:'default', assetRef}`, dan `{target:{pageId}, reset:true}` → `page.background === null`. color dan assetRef sekaligus → `ToolError`.
  - `setCover({enabled:true,title:'VISUAL ASLI'})` → `coverPanelId` string. `enabled:false` → `null`.
  - Setiap op yang mengubah project: `publish` dipanggil dengan `type:'project'`, dan `agentLock.state(slug)` ≠ `'none'`. `finishEditing` → `'none'`.
  - `listAssets` mengembalikan fixture project + global. `exportPdf` dilewati di sini (dicakup Task 4 e2e).
- [ ] **Step 2:** `pnpm vitest run tests/mcp-ops.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementasi. Validasi input dengan zod; schema yang sama di-export untuk Task 4.
- [ ] **Step 4:** Test PASS.
- [ ] **Step 5:** Commit `feat(mcp): agent operations over the shared model`.

### Task 4: Endpoint `/mcp`

**Files:**
- Create: `src/server/mcp/server.ts` (`buildMcpServer(): McpServer` mendaftarkan semua tool dari `ops` + deskripsi Indonesia singkat), `src/server/mcp/route.ts` (`mcpRoute(port): Hono`)
- Modify: `src/server/app.ts` (mount sebelum guard umum), `src/server/main.ts` (kirim port), `package.json` (`pnpm add @modelcontextprotocol/sdk@^1.32.1`)
- Test: `tests/mcp-route.test.ts`

**Interfaces:**
- Consumes: `ops` + schema zod (Task 3), `isMcpEnabled` (Task 1).
- Produces:
  - Tool MCP bernama snake_case sesuai §3.1.
  - Tiap hasil: `{ content:[{type:'text', text: JSON.stringify(out)}], structuredContent: out }`.
  - `ToolError` → `{ isError:true, content:[{type:'text', text: message}] }`.

- [ ] **Step 1: Tulis test yang gagal.** Gunakan `Client` + `StreamableHTTPClientTransport(new URL('http://127.0.0.1:5178/mcp'), { fetch: (u, i) => app.request(u, i) })`.
  - MCP mati → `connect` gagal, dan `app.request('/mcp', {method:'POST'})` → 404 dengan pesan persis.
  - MCP nyala → `listTools()` berisi tepat 19 nama sesuai tabel (sort lalu bandingkan).
  - `callTool create_project` → `structuredContent.slug`. `add_scene` dua kali lalu sekali lagi → hasil ketiga `isError:true`, teks `'Page sudah berisi 3 scene'`.
  - Header `Host: evil.com:5178` → 403. `Origin: http://evil.com` → 403.
  - Matikan MCP setelah `add_scene` (kunci aktif) → panggilan berikutnya 404. Setelah `IDLE_RELEASE_MS` (override 300 ms) `agentLock.state` = `'none'`.
- [ ] **Step 2:** `pnpm vitest run tests/mcp-route.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementasi.
  - Per request: `const t = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true }); await buildMcpServer().connect(t); return t.handleRequest(c.req.raw)`.
  - Cek host/origin sendiri sebelum transport.
- [ ] **Step 4:** Test PASS. Lalu smoke manual: `pnpm start` dengan MCP dinyalakan, dan `curl -s -X POST http://127.0.0.1:5178/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` mengembalikan 19 tool.
- [ ] **Step 5:** Commit `feat(mcp): streamable HTTP endpoint at /mcp`.

### Task 5: Editor live + kunci (state)

**Files:**
- Create: `src/web/state/live.ts` (`connectLive(slug): () => void`, membuka `EventSource('/api/projects/'+slug+'/events')`)
- Modify:
  - `src/web/state/editorStore.ts`: field `agentActive: boolean`, `agentSince: string | null`; aksi `remoteProject(p: Project)`, `setAgent(active: boolean, since: string | null)`.
  - `src/web/api.ts`: `agentAck(slug, clientId)`. 423 dilempar sebagai `ApiError` dengan `status`.
- Test: `tests/editorLive.test.ts`

**Interfaces:**
- Consumes: event `LiveEvent` (Task 2).
- Produces:
  - `remoteProject(p)`: `past = [...past, current]` (batas `HISTORY_LIMIT`), `future = []`, `project = p`, `saveStatus = 'saved'`, tanpa `schedule()`, seleksi lewat `fixSelection`.
  - `setAgent(true)`: set flag, lalu `await flush()` (error diabaikan), lalu `api.agentAck`.
  - Selama `agentActive`: `apply`, `undo`, dan `redo` adalah no-op. Store storyline yang ada menerima `storyline` event.
  - `setAgent(false)`: toast info `'AI selesai mengedit'`.
  - `hello`: simpan `clientId`. Bila `agent.active` berbeda dari state, panggil `setAgent`.

- [ ] **Step 1: Tulis test yang gagal** (mock `api`, fake timers).
  - Ada edit `dirty`, lalu `setAgent(true)` → `api.saveProject` dipanggil sebelum `api.agentAck`, dengan project yang berisi edit tersebut.
  - Saat aktif: `apply(...)` tidak mengubah `project`, `undo()` tidak mengubah. Tidak ada `saveProject` setelah 5 s.
  - `remoteProject(p2)` dua kali → `past` bertambah 2, `saveStatus 'saved'`, tidak ada `saveProject` setelah `AUTOSAVE_MS`.
  - `remoteProject` yang menghapus scene terpilih → `currentSceneId` pindah ke scene yang ada.
  - `setAgent(false)`, lalu `undo()` → kembali ke project sebelum `p2`, `saveStatus 'dirty'`, dan `saveProject` terpanggil setelah `AUTOSAVE_MS`.
  - `saveProject` ditolak 423 → `saveStatus 'error'` dengan pesan AI. Retry tetap dijadwalkan.
- [ ] **Step 2:** `pnpm vitest run tests/editorLive.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementasi. `Editor.tsx` memanggil `connectLive(slug)` di effect `load`, dan cleanup saat unmount.
- [ ] **Step 4:** Test PASS, lalu `pnpm test` (editorStore lama tetap hijau).
- [ ] **Step 5:** Commit `feat(editor): live project updates and agent lock state`.

### Task 6: Editor & Home UI saat agent bekerja + e2e

**Files:**
- Create: `src/web/editor/AgentBadge.tsx`
- Modify:
  - `Editor.tsx`: shortcut edit diabaikan saat `agentActive`.
  - `Toolbar.tsx`: badge; tombol edit disabled.
  - `PageSheet`/`SceneCanvas`/`LayerNode`: `listening`/`draggable` false, Transformer disembunyikan.
  - `PropsPanel.tsx` dan `StorylinePanel.tsx`: bungkus `<fieldset disabled={agentActive}>`.
  - `clipboard.ts`: return awal saat aktif.
  - Drop asset: diabaikan.
  - `ProjectList.tsx`: badge `AI` dari `agentActive`.
  - `styles.css`
- Test: `e2e/agent.spec.ts`

**Interfaces:**
- Consumes: `agentActive`, `agentSince` (Task 5). Endpoint `/mcp` (Task 4). `PUT /api/settings` (Task 1).

- [ ] **Step 1: Tulis e2e yang gagal.**
  - `request.put('/api/settings', {mcp:{enabled:true}})`. Buat project via UI dan buka editor.
  - Dari test, `Client` MCP ke `http://127.0.0.1:5197/mcp` memanggil:
    1. `add_page {scenes:2}`
    2. `update_scene` subtitle `'dari agent'`
  - Expected selama itu:
    - `.agent-badge` terlihat dengan teks `AI sedang bekerja`.
    - `.slide` count 2, tanpa reload.
    - Textarea subtitle disabled.
    - Ctrl+Z tidak mengubah jumlah slide.
    - Tombol `+ Scene` disabled.
  - Halaman Home di tab kedua menampilkan `.badge` `AI` di kartu project.
  - `finish_editing` → badge hilang, toast `AI selesai mengedit`.
  - Ctrl+Z dua kali → `.slide` count 1. Reload halaman → tetap 1 (undo tersimpan).
- [ ] **Step 2:** `pnpm exec playwright test e2e/agent.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementasi.
  - Badge: titik 6 px warna `--accent` dengan animasi opacity (bukan glow), teks `AI sedang bekerja… · <relativeTime(since)>`.
  - Badge Home memakai kelas `.badge.ai`.
- [ ] **Step 4:** e2e PASS, lalu `pnpm exec playwright test` semua hijau.
- [ ] **Step 5:** Commit `feat(editor): read-only lock and AI badge while an agent works`.

### Task 7: Mode gelap

**Files:**
- Create: `src/web/state/theme.ts`, `src/web/ui/ThemeToggle.tsx`
- Modify:
  - `index.html`: script inline sebelum `#root`.
  - `src/web/styles.css`: semua warna UI → variabel; blok `:root` dan `[data-theme="dark"]`.
  - Komponen yang memakai warna UI inline (`grep -rn "#[0-9a-fA-F]\{6\}" src/web/editor src/web/ui src/web/projects`): ganti dengan variabel, kecuali warna konten/default layer.
  - `ProjectList.tsx` dan `Toolbar.tsx`: pasang toggle.
  - `PrintRoute.tsx`: paksa `data-theme="light"`.
- Test: `tests/theme.test.ts`

**Interfaces:**
- Produces:
  - `type ThemePref = 'light' | 'dark' | 'system'`
  - `readThemePref(): ThemePref`
  - `resolveTheme(pref, prefersDark: boolean): 'light' | 'dark'`
  - `applyTheme(pref): void`: set `document.documentElement.dataset.theme`, simpan `sb.theme`, dan pasang listener `matchMedia` saat `system`.
  - `useTheme()`: zustand `{ pref, setPref }`.
  - `ThemeToggle`: tombol ☾/☀ dengan `aria-label` `Mode gelap` / `Mode terang`, beralih antara light dan dark.

- [ ] **Step 1: Tulis test yang gagal** (jsdom).
  - `resolveTheme('system', true) === 'dark'`; `resolveTheme('light', true) === 'light'`.
  - localStorage kosong → `readThemePref() === 'system'`. Nilai asing → `'system'`.
  - `applyTheme('dark')` → `documentElement.dataset.theme === 'dark'` dan localStorage `'dark'`.
  - Lint CSS: baca `src/web/styles.css`, buang blok `:root{…}` dan `[data-theme="dark"]{…}`, sisanya tidak boleh mengandung `#[0-9a-f]{3,8}\b` atau `rgba?\(` kecuali di baris yang mengandung komentar `/* content */`. Daftar pengecualian content: page/frame/thumb/canvas.
  - Kontras: fungsi `contrast(hexA, hexB)` di test, dengan pasangan `--text`/`--panel` dan `--muted`/`--panel` ≥ 4.5 untuk kedua palet. Nilai diambil dari CSS.
- [ ] **Step 2:** `pnpm vitest run tests/theme.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementasi.
  - Script inline di `index.html` (≤ 10 baris): baca `sb.theme`, resolve dengan `matchMedia('(prefers-color-scheme: dark)')`, set `data-theme`.
  - Konversi warna di `styles.css`.
- [ ] **Step 4:** Test PASS. Lalu cek visual di browser untuk Home grid/list, editor, dialog, popover, dan toast di kedua tema. PDF `/print` tetap terang.
- [ ] **Step 5:** Commit `feat(ui): dark mode`.

### Task 8: Dialog Pengaturan

**Files:**
- Create: `src/web/ui/SettingsDialog.tsx`
- Modify: `src/web/api.ts` (`getSettings`, `putSettings`), `ProjectList.tsx` + `Toolbar.tsx` (tombol ⚙), `README.md` (bagian MCP + contoh konfigurasi Hermes/Claude Code)
- Test: `e2e/settings.spec.ts`

**Interfaces:**
- Consumes:
  - `SettingsView` (Task 1)
  - `useTheme` (Task 7)
  - `Dialog` yang sudah ada (`src/web/ui/Dialog.tsx`)
  - `relativeTime` dari `projects/homeState.ts`
- Contoh konfigurasi yang ditampilkan dan disalin (persis):
  ```json
  { "mcpServers": { "storyboard-maker": { "type": "http", "url": "<url>" } } }
  ```

- [ ] **Step 1: Tulis e2e yang gagal.**
  1. Buka `/`, klik `Pengaturan`. Dialog berisi `MCP` dan switch `role=switch` `aria-checked=false`.
  2. `POST /mcp` → 404.
  3. Klik switch → `aria-checked=true`, dan `POST /mcp` (initialize) bukan 404.
  4. Teks URL `http://127.0.0.1:5197/mcp` tampil.
  5. Pilih Tema `Gelap` → `html[data-theme=dark]`. Tutup dialog dan reload → masih dark.
  6. Klik `ThemeToggle` → light.
- [ ] **Step 2:** `pnpm exec playwright test e2e/settings.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementasi.
  - Switch = `<button role="switch" aria-checked>`.
  - Tombol Salin memakai `navigator.clipboard.writeText`, plus toast `Disalin`.
  - Baris "Agent terakhir aktif" memakai `lastCallAt`.
- [ ] **Step 4:** Semua test hijau: `pnpm exec tsc --noEmit -p .`, `pnpm test`, `pnpm exec playwright test`.
- [ ] **Step 5:** Commit `feat(ui): settings dialog (theme, MCP toggle)`.
