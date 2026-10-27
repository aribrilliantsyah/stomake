# Changelog

All notable changes to Stomake are listed here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/).

Each section below becomes the description of the matching GitHub Release, where the installers are downloaded. Add entries under **Unreleased** as you work; `pnpm release` moves them into the new version.

## [Unreleased]

### Added
- First desktop release of Stomake: Windows installer (`.exe` / `.msi`) and Linux `.AppImage`, built automatically by GitHub Actions for every version tag.
- PowerPoint-style pages with 1–3 vertical 9:16 scenes each, an optional "VISUAL ASLI" cover, effect notes above and subtitles below every frame, and split top/bottom frames.
- Storyline panel: paste a script or import `.docx`, with word count.
- Project and global asset libraries: drag files in, drag thumbnails onto frames, paste screenshots from the clipboard.
- Image, text (15 bundled fonts plus local fonts, wrapping text boxes), 12 shapes and emoji layers with move, resize, rotate, flip, opacity, groups and drag-to-reorder.
- Aspect-ratio lock on image Width/Height (on by default): change one and the other follows.
- Home with search, filters, sorting, archive, duplicate, trash with undo, and `.zip` project export/import.
- Selectable storage folder, autosave, undo/redo, zoom 25–400%, light and dark themes.
- PDF export rendered by Chromium, with selectable text.
- Built-in MCP server (25 tools) so AI agents can build storyboards, with a live-locked editor and a request log.

### Changed
- App renamed from Storyboard Maker to Stomake. A data folder chosen in the old version is still found; MCP clients should re-register under the name `stomake`.
