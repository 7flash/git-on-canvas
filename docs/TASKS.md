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
- [x] ~~**Settings modal**~~ — ✅ DONE. Gear icon in toolbar opens premium dark-themed modal. Sections: Rendering (text mode, font size, card width), Interface (control mode, minimap, connections, auto-imports), Advanced (max visible lines). CSS in globals.css, inline positioning for reliability. All changes auto-saved to localStorage.
- [x] ~~**Positions stored in localStorage**~~ — ✅ Already implemented. Dual storage: localStorage (instant) + server sync (if logged in). Debounced 300ms persist.
- [x] ~~**Editor auto-save**~~ — ✅ DONE. Saves editor content every 3s to localStorage. Draft recovered on file reopen with "⟳ Draft restored" notification + Discard button. Cleared on explicit save. Expired drafts (>7 days) cleaned up on startup.
- [x] ~~**Tab persistence**~~ — ✅ DONE. Open tab paths saved to localStorage on every tab change. Restored as stub tabs on modal reopen. Content loaded lazily on tab switch.

## 🟡 Priority: Improve
- [ ] **Search across files** — Ctrl+Shift+F to search for text across all files in the repo

## 🟢 Priority: Features
- [ ] **File creation from canvas** — right-click canvas background → "New File" to create + edit
- [ ] **Branch switching** — dropdown to switch branches and see diff against different branches

## 📝 Architecture Notes
- **Canvas text = default** for main cards (performance + virtual scrolling)
- **DOM rendering = popup previews only** (hover/link peek)
- **Editor modal** = CodeMirror 6 with Edit (default) + Diff views. activateEditView() handles initialization.
- **Auto-save** = `auto-save.ts` — saves drafts to localStorage every 3s. Key format: `gitcanvas:draft:<repo>:<file>`. Integrated into file-modal.tsx editor lifecycle.
- **Tab persistence** = `file-tabs.ts` — saves open tab paths to localStorage. Restored on modal reopen with lazy content loading.
- **Settings** = `settings.ts` (localStorage persistence + custom events) + `settings-modal.tsx` (UI). CSS must go in `globals.css` (not `main.css` — that file is dead/not bundled).
- **Framework**: galaxydraw in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Bridge**: `galaxydraw-bridge.ts` — adapter between CanvasState and CanvasContext
