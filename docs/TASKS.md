# GitMaps Tasks & Ideas

## 🟡 Priority: Improve
- [ ] **Popup font size in settings** — Add a font size control for the long-line hover popup in the settings modal.
- [ ] **Cross-layer file navigation** — When clicking a changed file in the diff bar that's on another layer, should jump to that layer first then navigate to the card.
- [ ] **Nested folder selection** — "Select all from folder" context menu should show a nested submenu of ancestor directories so you can select at any tree level, not just the immediate parent.

## 🟢 Priority: Features
- [ ] **Collaborative cursor sharing** — WebSocket-based live presence showing other users' cursors on the canvas.

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
- **Canvas text rendering**: `canvas-text.ts` — custom scrollbar track, change gutter, hover popup
- **Diff markers**: Two systems — DOM `card-diff-markers.ts` (for non-canvas mode) and canvas `_buildChangeGutter()` (for canvas-text mode). Only one is active at a time.
