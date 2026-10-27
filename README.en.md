<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/stomake-lockup-dark.svg">
  <img src="docs/images/stomake-lockup.svg" alt="Stomake" width="480">
</picture>

<p align="center">
  <a href="README.md">Bahasa Indonesia</a> · <strong>English</strong>
</p>

<p align="center">
  <strong>Turn a script into a vertical 9:16 video storyboard, then export a PDF ready for your video editor. Runs locally, as a desktop app or in the browser.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white" alt="Node.js 22+">
  <img src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Playwright-1.x-45BA4B?logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/MCP-25_tools-AE4F2C" alt="Model Context Protocol">
  <a href="https://github.com/aribrilliantsyah/stomek/releases/latest"><img src="https://img.shields.io/github/v/release/aribrilliantsyah/stomek?label=download" alt="Latest release"></a>
</p>

</div>

> The app interface is in Indonesian. UI labels below are quoted as they appear, with a translation where it helps.

---

## ⬇️ Download

Ready-to-use installers are on the **[Releases](https://github.com/aribrilliantsyah/stomek/releases/latest)** page, each with its changelog.

| OS | File |
|---|---|
| Windows 10/11 | `Stomake_<version>_x64-setup.exe` (or `.msi`) |
| Linux x64 | `Stomake_<version>_amd64.AppImage` |

- **Windows**: run the installer. It is not code-signed yet, so if SmartScreen appears choose *More info → Run anyway*.
- **Linux**: `chmod +x Stomake_*.AppImage`, then run the file. No sudo needed.

Node, the server and Playwright ship inside the app. PDF export uses the Chrome/Edge already on the machine; if neither exists, headless Chromium is downloaded once on the first export.

---

## 📸 Screenshots

The editor examples below use the sample storyboard *"Kenapa Es Batu Mengapung?"* ("Why does ice float?") with illustrations made for this documentation.

### Editor
Left to right: slide (page) list, storyline script, the active page rendered exactly like the PDF, and scene/layer properties. Scene 2 uses a top/bottom split and the text layer "BENDA LAIN" is selected.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/editor-dark.png">
  <img src="docs/images/editor-light.png" alt="Storyboard editor: slides, storyline, a page with 3 scenes, properties panel">
</picture>

### Assets and scene zoom

| Asset tab: drag images onto a scene frame | Zoom into one scene (`Z`), star shape selected |
|---|---|
| ![Asset tab with project images](docs/images/editor-assets-light.png) | ![Zoomed scene with a selected shape](docs/images/scene-editor-detail.png) |

### Cover and Settings

| "VISUAL ASLI" cover (optional, not counted as a scene) | Settings: theme, storage folder, MCP |
|---|---|
| ![Cover page](docs/images/cover-slide.png) | ![Settings dialog](docs/images/settings-modal.png) |

### Home
Project list with search, Active/Archived filter, sorting, grid or list view, and project import from `.zip`.

| Light | Dark |
|---|---|
| ![Home, light theme](docs/images/dashboard-light.png) | ![Home, dark theme](docs/images/dashboard-dark.png) |

---

## ✨ Features

- **Desktop app (Tauri)**: native window for Windows and Linux (macOS can be built manually), no Node install needed. The browser version is still available via `pnpm start`.
- **PowerPoint-style slides**: each page holds 1–3 scenes, plus an optional *"VISUAL ASLI"* cover. Scene numbers continue across pages; scenes are never reflowed automatically.
- **Vertical 9:16 frames** for TikTok, Reels and Shorts. Each scene has an effect note above, the frame in the middle and a subtitle below. A frame can be split top/bottom for before → after.
- **Storyline side panel**: paste a script or import `.docx`, with a word count, then copy lines into scene subtitles.
- **Project and global assets**: upload by dragging files or with a button, drag thumbnails onto frames, or paste screenshots from the clipboard.
- **Layers**: images (PNG/JPG/GIF/WebP), text (15 bundled fonts + local fonts, single line or wrapping box with left/center/right alignment and line height), 12 shapes (rectangle, ellipse, line, arrow, target, cross, star, speech bubble, rotate arrow) and emoji. Move, resize, rotate, flip, opacity, groups, and drag-to-reorder in the layer list. Image Width/Height have an aspect-ratio lock (on by default): change one and the other follows.
- **Any storage folder**: pick the location yourself, e.g. `Documents`. Project folders copied there show up immediately.
- **`.zip` export / import**: move projects between machines or OSes, including the images they use.
- **Autosave, undo/redo, zoom 25–400%**.
- **PDF export** rendered by Chromium; text stays selectable and searchable.
- **MCP for AI agents**: 25 tools so Claude Code, Cursor or Hermes can build storyboards — text as real layers, generated patterned backgrounds, SVG illustrations, and a quality check before finishing. The editor locks and shows changes live while an agent works.

---

## 🚀 Getting started

### Requirements
- **Node.js** 22 or newer
- **pnpm** 10
- For PDF export: an installed Google Chrome, Chromium or Edge. Otherwise run `pnpm exec playwright install chromium`.

### Install & run

```bash
git clone https://github.com/aribrilliantsyah/stomek.git
cd stomek
pnpm install
pnpm start
```

Open **`http://127.0.0.1:5178`** in your browser.

### Desktop app (Tauri)

The desktop app wraps the same web app in a native window. The installer bundles Node, the server and Playwright, so users install nothing else.

Build requirements: [Rust](https://rustup.rs) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS (Linux: `webkit2gtk-4.1`).

```bash
pnpm desktop:dev     # desktop window with a local build
pnpm desktop:build   # installers in src-tauri/target/release/bundle/
```

Installers are built per OS and cannot be cross-built: run `pnpm desktop:build` on Windows for `.exe`/`.msi`, on Linux for `.deb`/`.rpm`/`.AppImage`, on macOS for `.dmg`. The bundled Node binary is the one running the build. Official releases are built by GitHub Actions (see **Releasing a new version** below).

Drag image files from your file manager onto the **Asset** tab to upload them to Project or Global. For screenshots or images from other apps, select a scene and press **Ctrl+V** (**Cmd+V** on macOS); the image is saved as a scene clip, not directly into the Asset library. Pasting text into inputs still uses the system clipboard.

The webview engine differs per OS: WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS. On Linux, file drops from other apps are handled through GTK; thumbnail/layer/slide drags inside the editor stay HTML5. Clipboard images fall back to a native read when the webview provides no file on paste.

After changing native integration or its dependencies, restart `pnpm desktop:dev` or rebuild with `pnpm desktop:build`; an installed app does not pick up new code by itself.

---

## 📂 Data storage

All projects and assets are stored locally in the **storage folder**. Default `~/Storyboard` (Windows: `C:\Users\<name>\Storyboard`). Change it in ⚙ **Pengaturan → Folder penyimpanan → Ganti folder…** (Settings → Storage folder → Change folder), e.g. to `Documents` or a cloud-synced folder. The choice is stored per OS in the app config folder (`%APPDATA%\stomake`, `~/Library/Application Support/stomake` or `~/.config/stomake`); a choice made in older versions (folder `storyboard-maker`) is still read. Data in the old folder is not moved. The `STORYBOARD_HOME` environment variable, when set, always wins.

```text
~/Storyboard/
├── library/                           # Global asset library
├── settings.json                      # Global settings & MCP config
├── logs/mcp.jsonl                     # MCP call log
└── projects/
    └── <project-slug>/
        ├── project.json               # Storyboard & layer data
        ├── storyline.txt              # Project script
        ├── assets/                    # Project image assets
        ├── clips/                     # Pasted clipboard images
        └── exports/
            └── storyboard.pdf         # Exported PDF
```

- **Copy a folder**: copy `projects/<slug>/` into `projects/` of another storage folder and the project appears on Home. Folder names must be lowercase letters, digits and `-`.
- **`.zip` export / import**: project menu ⋯ → **Export (.zip)…**, then on the other machine click **Import** on Home. The zip contains `project.json`, the storyline, `assets/` and `clips/`. Global (library) assets used by the project are copied into `assets/` so nothing goes missing. Import never overwrites an existing project; a clashing slug gets a `-2` suffix.

---

## ⌨️ Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo |
| `Ctrl + Shift + Z` | Redo (alternative) |
| `Ctrl + =` / `Ctrl + -` | Zoom in / out |
| `Ctrl + 0` | Fit to screen |
| `Delete` / `Backspace` | Delete selected layers |
| `Ctrl + D` | Duplicate selected layers |
| `Ctrl + A` | Select all layers in the active panel |
| `Shift` / `Ctrl` + click, or drag a box on empty space | Multi-select layers |
| `Ctrl + G` / `Ctrl + Shift + G` | Group / ungroup layers |
| `]` / `[` | Bring forward / send backward (`Shift` = to front/back) |
| Arrow keys | Nudge layers 5px (`Shift` = 50px) |
| `Ctrl + C` / `Ctrl + V` | Copy and paste layers between scenes |
| `Ctrl + X` | Cut layers |
| `Z` / double-click a frame | Zoom into one scene |
| `Esc` | Clear selection / leave zoom |
| `Ctrl + 1` / `2` / `3` | Toggle the Slides, Storyline, Properties panels |
| `←` / `→` on the Storyline/Asset tabs | Switch tab |

---

## 🤖 AI agent integration (MCP server)

Stomake includes a built-in **Model Context Protocol (MCP)** server for AI coding agents.

### Enabling MCP
1. Open ⚙ **Pengaturan** (Settings) at the top right.
2. Turn on **MCP (agent AI)**.
3. Configure your agent client:

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

*Claude Code example:*
```bash
claude mcp add --transport http stomake http://127.0.0.1:5179/mcp
```

> MCP has its own port (default **5179**), separate from the app (5178). Agents registered against `:5178/mcp` earlier must switch to the URL shown in Settings.

### Configuration

Everything is under ⚙ **Pengaturan → MCP** and applies immediately, no restart:

| Section | Contents |
|---|---|
| Connection | Port (1024–65535). If another program holds the port, the old setting stays and a message appears. Extra hosts besides `127.0.0.1`/`localhost` (e.g. `storyboard.local`). |
| Editor lock | Seconds after the last call before the editor unlocks (default 10), and how long an agent waits for the editor to save before starting (default 3). |
| Tool permissions | Disable tools individually or by group (Read, Edit project, Create images, Export & session). Disabled tools are invisible to agents. |
| Log | Record calls, whether to keep input/result bodies, and the maximum number of entries (default 2000). |

The `STORYBOARD_MCP_PORT` variable pins the port from outside the app.

### MCP log

**Pengaturan → MCP → Buka log MCP** (Open MCP log), or `/mcp-logs`, shows every connection, tool listing and tool call with status, duration, agent client name, input and result. Rejected calls (MCP off, unknown host, disabled tool) are logged too.

- Filters: text search (including input/result bodies), success/failure, tool, kind, project and time range. Filters are kept in the URL.
- **Live** updates the table while an agent works. Click a row for details; `↑`/`↓` move between rows, `Esc` closes the details.
- **Export** downloads the filtered entries as `.jsonl`; **Hapus log** (Clear log) deletes everything.
- The log lives in `<storage folder>/logs/mcp.jsonl`. Long text (e.g. SVG code) is truncated to 2000 characters.

### 25 tools available to agents
- **Read**: `list_projects`, `get_project`, `get_storyline`, `list_assets`, `list_fonts`, `check_storyboard`
- **Project & script**: `create_project`, `set_storyline`
- **Pages & scenes**: `add_page`, `remove_page`, `add_scene`, `remove_scene`, `update_scene`, `set_cover`, `set_background`
- **Layers**: `add_layer`, `add_layers`, `update_layer`, `remove_layer`, `reorder_layer`, `group_layers`
- **Create images**: `add_svg_asset`, `add_pattern_asset`
- **Output & session**: `export_pdf`, `finish_editing`

### Storyboard rules given to agents

The server sends these rules to the agent on connect, so they need not be repeated in every prompt:

1. **Text is a text layer, never an image.** Titles, labels and numbers must be `add_layer`/`add_layers` of type `text` so they stay editable, restylable and searchable in the PDF. Text inside `add_svg_asset` is rejected (`<text>`, `<tspan>`, `<textPath>`, `<foreignObject>`).
2. **Long sentences use a wrapping box.** Text layers accept `width` (wrap width), `align` (left/center/right) and `lineHeight`, so long narration wraps instead of running off the frame.
3. **Fonts only from `list_fonts`** — the 15 bundled fonts that are guaranteed in the PDF export.
4. **No plain backgrounds.** `add_pattern_asset` creates patterned backgrounds (`grid`, `graph`, `dots`, `diagonal`, `rays`, `checker`, `waves`) with colors, two-color gradients, density, thickness, pattern opacity and an optional vignette.
5. **Frames must be informative**: the subject combined with meaning markers (arrows, targets, crosses, speech bubbles, number badges, reaction emoji), 2–5 layers per frame, placed in one `add_layers` call.
6. **Effect notes and subtitles are required**, set with `update_scene` from the storyline.
7. **`check_storyboard` before finishing**: reports missing assets/backgrounds, layers outside the frame, text too small for the PDF, long sentences without `width`, empty frames, empty subtitles, and plain backgrounds in every frame.

### Agents drawing their own illustrations

With `add_svg_asset`, an agent writes SVG code (a glass, ice cubes, an iceberg, a diagram) and the server renders it to a transparent PNG saved in the project's **Asset** tab. The image appears in the open editor right away, and the returned `assetRef` works with `add_layer` or `set_background`. Good for flat illustrations, icons and diagrams; use real images for photos or realistic characters.

Example prompt:

> Create a project "Why does ice float?", draw a glass of water, ice cubes and an iceberg yourself in SVG, use a graph-paper background, then lay out 3 scenes explaining it.

Rendering runs in Chromium with JavaScript and network disabled: scripts, remote images and external fonts in the SVG are ignored. Limits: SVG up to 1 MB, PNG up to 2048 px.

*Security note*: the MCP server listens only on `127.0.0.1` and rejects external hosts.

---

## 🛠️ Development

```bash
# Dev mode (server :5178 + Vite HMR :5173)
pnpm dev

# Unit tests & PDF export tests
pnpm test

# Playwright end-to-end tests
pnpm e2e

# TypeScript type check
pnpm typecheck
```

---

## 🏷️ Releasing a new version

The app version comes from `package.json` (the desktop build reads it through `tauri.conf.json`). Changes are written in [`CHANGELOG.md`](CHANGELOG.md), which becomes the description on the download page.

1. Describe your changes under `## [Unreleased]` in `CHANGELOG.md`, then commit.
2. Run one of:

   ```bash
   pnpm release patch --push   # 0.1.0 → 0.1.1
   pnpm release minor --push   # 0.1.0 → 0.2.0
   pnpm release 1.0.0 --push   # an explicit version
   ```

   The script bumps the version in `package.json` and `src-tauri/Cargo.toml`, moves the *Unreleased* entries to `## [x.y.z] - date`, commits `release: vX.Y.Z`, creates tag `vX.Y.Z` and pushes. Without `--push`, push yourself with `git push --follow-tags`.
3. A `v*.*.*` tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml): Windows (`.exe` + `.msi`) and Linux (`.AppImage`) installers are built in parallel, then a GitHub Release is published with a download table and that version's changelog. If either build fails, the release stays a draft.

The workflow rejects a tag that differs from the `package.json` version, and the release fails if that version's changelog section is empty.

Full guide (repo setup, watching builds, redoing a failed release), in Indonesian: [`docs/GITHUB.md`](docs/GITHUB.md).

---

## 📄 License

Distributed under the MIT license.
