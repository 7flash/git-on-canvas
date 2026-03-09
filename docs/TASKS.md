# GitMaps Tasks & Ideas

## ✅ All Tasks Complete!

Every planned feature has been implemented and tested:

- [x] **Minimap broken (NaN poisoning)** — `isNaN()` guards in minimap rebuild, fitAllFiles, createAllFileCard
- [x] **FitAll → NaN% zoom** — same NaN poisoning fix
- [x] **Canvas text = default** — changed from opt-in to default
- [x] **Canvas scrollbar invisible** — full-width scroll shim
- [x] **Canvas change markers** — 6px gutter bars + scrollbar overlay + ▲/▼ hunk navigation
- [x] **AI/Unfold buttons removed** — cleaned from both templates
- [x] **F hotkey removed** — obsolete with canvas text virtual scrolling
- [x] **Changed file click** — just navigates, no auto-expand
- [x] **Drag from full card body** — skips interactive elements only
- [x] **Hover popup alignment** — PREVIEW matches LOD threshold
- [x] **Popup scroll** — removed overflow:hidden from clones
- [x] **Duplicate cards** — hide pills during LOD transition
- [x] **Arrange in pill mode** — checks fileCards → deferredCards → pills
- [x] **Selection outline** — CSS outline + z-index:5
- [x] **Multi-tab editor** — CodeMirror + Edit/Diff tabs + import links
- [x] **Canvas text resize fix** — DPR scaling via setTransform reset
- [x] **Pill dblclick** — opens editor modal
- [x] **Settings modal** — Rendering/Interface/Advanced, auto-saved to localStorage
- [x] **Positions in localStorage** — dual storage with server sync
- [x] **Editor auto-save** — drafts every 3s, "⟳ Draft restored" on reopen
- [x] **Tab persistence** — tab paths saved to localStorage, lazy restore
- [x] **Search across files** — Ctrl+Shift+F, git grep backend, slide-in panel
- [x] **File creation** — Ctrl+N, `new-file-dialog.tsx`, templates by extension
- [x] **Branch switching** — toolbar button, slide-out drawer, base/compare selects, diff summary

## 📝 Architecture Notes
- **Canvas//DOM split**: Canvas text for cards, DOM for popup previews & modals
- **Editor modal**: CodeMirror 6 + `file-modal.tsx`, auto-save via `auto-save.ts`
- **Tab system**: `file-tabs.ts` with localStorage persistence
- **Global search**: `global-search.ts` (UI) + `/api/repo/search` (git grep)
- **Branch compare**: `branch-compare.ts` (drawer) + `/api/repo/branch-diff` (API)
- **Settings**: `settings.ts` + `settings-modal.tsx`, CSS in `globals.css` only
- **New file**: `new-file-dialog.tsx`, templates via `getTemplateContent()`
- **Framework**: GalaxyDraw engine in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Bridge**: `galaxydraw-bridge.ts` — adapter between CanvasState and CanvasContext
