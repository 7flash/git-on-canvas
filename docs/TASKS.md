# GitMaps Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**WARMAPS zoom propagation**~~ — ✅ Already fixed in starwar repo (engine checks `[data-card-type]` + `consumesWheel`).
- [x] ~~**Canvas mode missing scrollbar**~~ — ✅ Fixed: sticky canvas positioning, absolute scroll shim, scrollbar CSS for `.canvas-container`.
- [x] ~~**Multi-file drag broken**~~ — ✅ CardManager syncs selected cards; multi-drag works.
- [x] ~~**Commit graph HTML entity encoding**~~ — ✅ Removed double-escaping.
- [x] ~~**Card duplication on scroll**~~ — ✅ `materializeViewport` now removes from `ctx.deferredCards` to prevent viewport-culling duplication.
- [x] ~~**Hide file doesn't work**~~ — ✅ Hidden files now excluded from viewport-culling materialization and deferredCards.

## 🟡 Priority: Improve
- [x] ~~**`cards.tsx` refactored from 1790→833 lines**~~ — ✅ 5 modules extracted: `card-context-menu.tsx`, `card-arrangement.ts`, `file-modal.tsx`, `card-diff-markers.ts`, `card-expand.ts`.
- [x] ~~**File hover in zoomed-out mode**~~ — ✅ DONE. Full card clone preview (syntax highlighting, diff markers, status badges) at <35% zoom. Forces DOM rendering when canvas-text mode active. Debounced 180ms with smooth fade.
- [x] ~~**File search not documented**~~ — ✅ Cross-card text search (`/` or `Ctrl+F`) documented.
- [x] ~~**Performance profiling**~~ — ✅ 15 benchmarks. 10K cards: 27ms full pipeline.
- [x] ~~**Connection line rendering optimization**~~ — ✅ `requestAnimationFrame` batching.
- [x] ~~**Pill cards: vertical text**~~ — ✅ Rotated text (48px, readable at 8-20% zoom).
- [x] ~~**Minimap: show all files**~~ — ✅ Minimap includes deferred cards.
- [x] ~~**Fit All: include deferred cards**~~ — ✅ `fitAllFiles` accounts for deferred positions.
- [x] ~~**Smooth LOD transition**~~ — ✅ Fade in with scale + opacity animation.

## 🟢 Priority: Features
- [x] ~~**Inline file editing**~~ — ✅ DONE. Edit tab in file preview modal with textarea, Ctrl+S save via POST /api/repo/file-save, cursor tracking, modified/saved status indicators. Path traversal protection.
- [ ] **File editing: syntax highlighting in textarea** — Use CodeMirror or Monaco for the edit textarea instead of plain textarea for proper syntax highlighting while editing.
- [ ] **File editing: git integration** — After saving a file, option to stage + commit the change directly from the modal.
- [x] ~~**Card grouping / folders**~~ — ✅ `card-groups.ts`. Click 📁 dir-labels to collapse/expand. Group cards show file count, line count, change markers, mini file list. State persisted per repo.
- [x] ~~**Export canvas as PNG/SVG**~~ — ✅ `canvas-export.ts`. Ctrl+Shift+E (full canvas) / Ctrl+Shift+V (viewport). Renders cards with file names, language colors, diff markers, branded header, timestamp.
- [x] ~~**Multi-repo workspace**~~ — ✅ `multi-repo.ts` supports 2-3 repos side-by-side.
- [x] ~~**Branch comparison view**~~ — ✅ `branch-compare.ts` glassmorphism drawer.
- [x] ~~**Command Palette (Ctrl+K)**~~ — ✅ Fuzzy file search overlay.
- [x] ~~**Enhanced Context Menu**~~ — ✅ Right-click 8 organized actions.
- [x] ~~**Cross-card text search**~~ — ✅ `/` or `Ctrl+F`.
- [x] ~~**Directory labels**~~ — ✅ `renderDirectoryLabels()`.
- [x] ~~**Status bar**~~ — ✅ `status-bar.ts`.

## ✅ Recently Fixed (this session)
- [x] **Card duplication** — materializeViewport syncs deferredCards removal.
- [x] **Hide file not working** — viewport-culling + deferredCards now check hiddenFiles.
- [x] **Folder bulk-hide** — Hidden files modal now has "Hide by folder" section.
- [x] **bgrun dashboard self-kill** — error() throws instead of process.exit(1).
- [x] **bgrun validateDirectory crash** — Same fix, now throws.
- [x] **cards.tsx refactoring** — 1790→1128 lines. 3 modules extracted.
- [x] **Files show "X more lines" with no expand** — IntersectionObserver auto-loads on scroll.
- [x] **Right-click context menu not working** — CardManager cards now get contextmenu/dblclick/click handlers.
- [x] **Text mode toggle broken** — Now uses `rerenderCurrentView()`.
- [x] **Connections visible by default** — Default OFF, persisted to localStorage.
- [x] **Minimap missing most files** — CardManager path now syncs `ctx.deferredCards`.
- [x] **Canvas cursor stuck on grab** — Defaults to normal, grab only during pan.
- [x] **Selected cards not visually clear** — 3px purple outline with glow.
- [x] **bgrun zombie sweep** — Skips generic keywords to prevent self-kill.

## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Import**: Relative `../../packages/galaxydraw/src/core/...` (not package name)
- **Bridge**: `galaxydraw-bridge.ts` — adapter between CanvasState and CanvasContext
- **Key files**: `cards.tsx` (833 LOC), `card-context-menu.tsx`, `card-arrangement.ts`, `file-modal.tsx`, `card-diff-markers.ts`, `card-expand.ts`, `events.tsx`, `canvas.ts`, `repo.tsx`
