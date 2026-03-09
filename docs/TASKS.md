# GitMaps Tasks & Ideas

## ✅ Fixed This Session
- [x] **Minimap broken (NaN poisoning)** — corrupted position records caused `Math.min/max` to return NaN, cascading to all 126 dots. Fixed with `isNaN()` guards in minimap rebuild, fitAllFiles, and createAllFileCard.
- [x] **FitAll → NaN% zoom** — same NaN poisoning. Fixed.
- [x] **Canvas text = default** — changed from opt-in to default. Much better rendering performance.
- [x] **Canvas scrollbar invisible** — scroll shim was 1px wide with opacity:0. Now full-width with pointer-events:none for native scrollbar.
- [x] **Canvas change markers too small** — added 6px left gutter bars + full scrollbar-style change gutter overlay with clickable markers + ▲/▼ hunk navigation.
- [x] **AI/Unfold buttons in header** — removed from both card templates (JSX + innerHTML).
- [x] **F hotkey expanding cards** — removed. Obsolete with canvas text virtual scrolling.
- [x] **Changed file click auto-expands** — removed expandCardByPath call, just navigates.
- [x] **Drag only from header** — engine now listens on full card body, skips interactive elements.
- [x] **Hover popup before pill mode** — aligned PREVIEW_ZOOM_THRESHOLD with LOD_ZOOM_THRESHOLD.
- [x] **Popup scroll broken** — removed overflow:hidden and pointerEvents:none from clones.
- [x] **Duplicate cards (pill + full)** — immediately hide pills with materialized cards during LOD transition.
- [x] **Arrange buttons in pill mode** — getSelectedCardsInfo now checks fileCards → deferredCards → pills. applyPosition updates all three.
- [x] **Selection outline on multi-drag** — added outline + outline-offset to .file-card.selected CSS with z-index:5.
- [x] ~~**Multi-tab editor modal**~~ — ✅ DONE. Double-click opens CodeMirror editor directly. Modal has Edit (default) + Diff tabs. Import links open as new tabs. Blame/Chat removed from modal, accessible via context menu. "Open in Editor" context menu action.
- [x] ~~**Canvas text garbled after resize**~~ — ✅ DONE. DPR scaling was compounding in ResizeObserver (`ctx.scale()` → `ctx.setTransform()` reset).
- [x] ~~**Pill dblclick opens zoom instead of editor**~~ — ✅ DONE. viewport-culling.ts now opens editor modal on pill double-click, consistent with card behavior.
- [x] ~~**Settings modal**~~ — ✅ DONE. Gear icon in toolbar. Sections: Rendering, Interface, Advanced. CSS in globals.css. Auto-saved to localStorage.
- [x] ~~**Positions stored in localStorage**~~ — ✅ Already implemented. Dual storage: localStorage + server sync.
- [x] ~~**Editor auto-save**~~ — ✅ DONE. Saves drafts every 3s to localStorage. "⟳ Draft restored" + Discard on reopen. Cleared on explicit save.
- [x] ~~**Tab persistence**~~ — ✅ DONE. Tab paths saved to localStorage. Restored as stubs on reopen. Lazy content loading.
- [x] ~~**Search across files**~~ — ✅ DONE. Ctrl+Shift+F opens slide-in panel. `git grep` backend via `/api/repo/search`. Results grouped by file with yellow highlights. Click → opens editor at matching line.

## 🟢 Priority: Features
- [ ] **File creation from canvas** — ~~right-click canvas background → "New File"~~ ✅ Already implemented (`new-file-dialog.tsx`, wired to Ctrl+N)
- [ ] **Branch switching** — dropdown to switch branches and see diff against different branches

## 📝 Architecture Notes
- **Canvas text = default** for main cards (performance + virtual scrolling)
- **DOM rendering = popup previews only** (hover/link peek)
- **Editor modal** = CodeMirror 6 with Edit (default) + Diff views. activateEditView() handles initialization.
- **Auto-save** = `auto-save.ts` — drafts to localStorage every 3s. Key: `gitcanvas:draft:<repo>:<file>`.
- **Tab persistence** = `file-tabs.ts` — tab paths to localStorage. Lazy content loading on switch.
- **Global search** = `global-search.ts` (UI) + `/api/repo/search` (git grep backend). Ctrl+Shift+F.
- **Settings** = `settings.ts` + `settings-modal.tsx`. CSS in `globals.css` only (main.css is dead).
- **New file** = `new-file-dialog.tsx` — Ctrl+N. Template content by extension.
- **Framework**: galaxydraw in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Bridge**: `galaxydraw-bridge.ts` — adapter between CanvasState and CanvasContext
