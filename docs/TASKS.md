# GitMaps Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Connection lines too dense at low zoom**~~ — ✅ DONE. Zoom-aware LOD in `renderConnections`: below 35% only cross-dir connections show, between 35-60% same-dir connections fade in proportionally. Stroke width, dash pattern, and endpoint radius scale inversely with zoom. Labels hidden below 50% (unreadable).

## 🟡 Priority: Improve
- [x] ~~**Layer bubble occludes cards**~~ — ✅ DONE. CSS auto-minimize: `max-width: 160px` + `opacity: 0.5` when not hovered, expands to full `800px` on `:hover` with smooth 300ms transitions. Reduces visual footprint by ~80% during normal canvas work.
- [x] ~~**Canvas AI panel UX**~~ — ✅ DONE. Panel now resizable (`resize: horizontal`, 240–600px range) with `direction: rtl` trick for left-side resize handle. Users can shrink the panel to just 240px or expand to 600px.

## 🟢 Priority: Features
- [ ] **File dependency graph view** — Visualize import relationships as a force-directed graph layout. Users could toggle between spatial layout and dependency graph.
- [ ] **Quick file switcher (Ctrl+P)** — Fuzzy file finder like VS Code's Ctrl+P. Type to search across all files in the repo, Enter to navigate to the card.

## ✅ Completed
- [x] ~~**Nested folder selection**~~ — ✅ DONE. "Select from folder" now shows a dropdown with all ancestor directories. Selection is recursive — picking `app` selects everything under `app/`.
- [x] ~~**Settings modal JSX refactor**~~ — ✅ DONE. Converted from innerHTML string template to proper JSX components using melina/client render.
- [x] ~~**Popup font size in settings**~~ — ✅ DONE. New `popupFontSize` setting (10-24px slider) reads from localStorage, live-updates popup on change.
- [x] ~~**Cross-layer file navigation**~~ — ✅ DONE. `jumpToFile` now calls `navigateToFileInLayer` when file not found on current layer, switches layers and retries.
- [x] ~~**Collaborative cursor sharing**~~ — ✅ DONE. WebSocket-based live presence via Bun pub/sub. Broadcasts canvas-space mouse coords at 50ms throttle. Remote cursors rendered as colored SVG pointers with name labels. 5s stale fade, 15s auto-remove. Positions sync with local viewport pan/zoom.
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
- [x] ~~**Canvas text rendering performance**~~ — ✅ DONE. 5 optimizations: (1) rAF batching, (2) cached DPR, (3) pre-computed padded line numbers, (4) cached long-line gradient, (5) hoisted options/lineHeight/contentX before loop.
- [x] ~~**Keyboard shortcuts documentation**~~ — ✅ Already existed. `shortcuts-panel.ts` implements a `?` hotkey that opens a glassmorphism cheat sheet.
- [x] ~~**Git blame integration**~~ — ✅ Already existed. `loadBlameView()` in file-modal.tsx with caching, color-coded authors, time-ago timestamps.
- [x] ~~**PR review mode**~~ — ✅ DONE. `pr-review.ts` module with comment CRUD, localStorage persistence, glassmorphism comment thread popup.
- [x] ~~**Multi-repo workspace**~~ — ✅ Already existed. `multi-repo.ts` (287 lines).
- [x] ~~**Git heatmap visualization**~~ — ✅ DONE. `heatmap.ts` + `/api/repo/git-heatmap` API.
- [x] ~~**File breadcrumbs navigation**~~ — ✅ DONE. `breadcrumbs.ts` renders file path as clickable segments with sibling dropdowns.
- [x] ~~**Card grouping / directory collapse**~~ — ✅ DONE. `card-groups.ts` collapses directories into compact summary cards.

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
