# GitMaps Tasks & Ideas

## ✅ Completed
- [x] ~~**Nested folder selection**~~ — ✅ DONE. "Select from folder" now shows a dropdown with all ancestor directories. Selection is recursive — picking `app` selects everything under `app/`.

## ✅ Completed
- [x] ~~**Settings modal JSX refactor**~~ — ✅ DONE. Converted from innerHTML string template to proper JSX components using melina/client render.
- [x] ~~**Popup font size in settings**~~ — ✅ DONE. New `popupFontSize` setting (10-24px slider) reads from localStorage, live-updates popup on change.
- [x] ~~**Cross-layer file navigation**~~ — ✅ DONE. `jumpToFile` now calls `navigateToFileInLayer` when file not found on current layer, switches layers and retries.

## ✅ Completed
- [x] ~~**Collaborative cursor sharing**~~ — ✅ DONE. WebSocket-based live presence via Bun pub/sub. Broadcasts canvas-space mouse coords at 50ms throttle. Remote cursors rendered as colored SVG pointers with name labels. 5s stale fade, 15s auto-remove. Positions sync with local viewport pan/zoom.

## ✅ Completed
- [x] ~~**Popup non-blocking**~~ — ✅ DONE. `pointer-events: none` so popup never blocks cursor movement to adjacent lines.
- [x] ~~**Popup wheel scroll**~~ — ✅ DONE. When popup has overflowing content, wheel events scroll the popup instead of the card body.
- [x] ~~**Double scrollbar fix**~~ — ✅ DONE. Hidden native scrollbar (`scrollbar-width: none`) since CanvasTextRenderer has its own custom scroll track.
- [x] ~~**Editor scroll position from canvas**~~ — ✅ DONE. Double-click on canvas card reads `getVisibleLine()` and passes `initialLine` to editor modal, which calls `scrollToLine` on CodeMirror.
- [x] ~~**Horizontal scroll reverted**~~ — ✅ Removed. User prefers hover popup for long lines over horizontal scroll.
- [x] ~~**Hover popup flicker near edge**~~ — ✅ DONE. Hysteresis + instant line-switch (no debounce), 200ms delayed hide.
- [x] ~~**Scrollbar thumb drag**~~ — ✅ DONE. Dragging the vertical scrollbar thumb now smoothly scrubs scroll position. Click on track background jumps to position. Thumb highlights purple during drag.
- [x] ~~**Scrollbar invisible when not hovering**~~ — ✅ DONE. Custom scrollbar now maintains baseline 0.5 opacity, brightens on hover/scroll, fades back to baseline instead of 0.
- [x] ~~**Duplicate diff marker columns**~~ — ✅ DONE. Canvas-text mode now skips the DOM diff-marker-strip since CanvasTextRenderer already builds its own change gutter. Added `!useCanvasText` guard.
- [x] ~~**Hover popup positioning**~~ — ✅ DONE. Hover popup for long lines and deleted diffs now appears above cursor by default, falling below only when near the top edge of the screen.
- [x] ~~**Pill selection highlight not visible**~~ — ✅ DONE. Zoomed-out pill selection uses 8px outline, 6px offset, massive triple box-shadow glow (60px + 100px spread), z-index 100, and brightness(1.3) filter for maximum visibility at low zoom.
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
- [x] ~~**Branch switching**~~ — toolbar button, slide-out drawer, base/compare selects, diff summary

## 🟡 Priority: Improve
- [ ] **Canvas text rendering performance** — Profile and optimize `canvas-text.ts` for repos with 100+ files. Current rendering creates a canvas per card; consider shared atlas or WebGL text rendering for large repos.
- [x] ~~**Keyboard shortcuts documentation**~~ — ✅ Already existed. `shortcuts-panel.ts` implements a `?` hotkey that opens a glassmorphism cheat sheet with 4 categories (Navigation, Selection, Cards, Tools). Wired in `page.client.tsx`, styled in `globals.css`.

## 🟢 Priority: Features
- [x] ~~**Git blame integration**~~ — ✅ Already existed. `loadBlameView()` in file-modal.tsx with caching, color-coded authors, time-ago timestamps. API endpoint at `/api/repo/git-blame` with porcelain parsing.
- [ ] **PR review mode** — Add ability to leave inline comments on diff lines (stored in localStorage or synced via WebSocket for collaborative review).
- [ ] **Multi-repo workspace** — Support loading and switching between multiple repositories in a single canvas session (currently only one repo at a time).

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
- **Canvas text rendering**: `canvas-text.ts` — custom scrollbar track, change gutter, hover popup
- **Diff markers**: Two systems — DOM `card-diff-markers.ts` (for non-canvas mode) and canvas `_buildChangeGutter()` (for canvas-text mode). Only one is active at a time.
