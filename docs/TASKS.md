# GitMaps Tasks & Ideas

## 🔴 Priority: Fix
- [ ] **Multi-file drag broken in zoomed-in view** — When multiple cards are selected, dragging only moves one. The CardManager's drag handler doesn't check `selectedCards` from XState. Need to intercept drag in the `else` branch of `setupCardInteraction` and move all selected cards together.
- [ ] **Commit graph HTML entity encoding** — Sidebar shows `HEAD -&gt; recover-state` with raw HTML entities instead of properly rendered text.
- [ ] **File hover preview fires at wrong zoom** — Preview tooltip shows when zoomed in to individual files. Should only appear when zoomed out far enough that card text is unreadable. The threshold (0.35) may be correct but `getGalaxyDrawState().zoom` might return a different scale than expected.

## 🟡 Priority: Improve
- [ ] **`cards.tsx` is 1128 lines** (down from 1790) — Extracted `card-context-menu.tsx`, `card-arrangement.ts`, `file-modal.tsx`. Remaining: diff components, card expand, interaction could still be extracted.
- [ ] **File hover in zoomed-out mode** — Should show the same card rendering (with diff markers, connections, etc.) as zoomed-in view, not a simplified tooltip. User wants exact same component rendered in the popup.
- [x] ~~**File search not documented**~~ — ✅ Cross-card text search (`/` or `Ctrl+F`) documented.
- [x] ~~**Performance profiling**~~ — ✅ 15 benchmarks. 10K cards: 27ms full pipeline.
- [x] ~~**Connection line rendering optimization**~~ — ✅ `requestAnimationFrame` batching.
- [x] ~~**Pill cards: vertical text**~~ — ✅ Rotated text (48px, readable at 8-20% zoom).
- [x] ~~**Minimap: show all files**~~ — ✅ Minimap includes deferred cards.
- [x] ~~**Fit All: include deferred cards**~~ — ✅ `fitAllFiles` accounts for deferred positions.
- [x] ~~**Smooth LOD transition**~~ — ✅ Fade in with scale + opacity animation.

## 🟢 Priority: Features
- [ ] **Inline file editing** — Allow editing file content directly on canvas cards.
- [ ] **Card grouping / folders** — Collapse entire directories into a single group card.
- [ ] **Export canvas as PNG/SVG** — Screenshot current canvas for docs/sharing.
- [x] ~~**Multi-repo workspace**~~ — ✅ `multi-repo.ts` supports 2-3 repos side-by-side.
- [x] ~~**Branch comparison view**~~ — ✅ `branch-compare.ts` glassmorphism drawer.
- [x] ~~**Command Palette (Ctrl+K)**~~ — ✅ Fuzzy file search overlay.
- [x] ~~**Enhanced Context Menu**~~ — ✅ Right-click 8 organized actions.
- [x] ~~**Cross-card text search**~~ — ✅ `/` or `Ctrl+F`.
- [x] ~~**Directory labels**~~ — ✅ `renderDirectoryLabels()`.
- [x] ~~**Status bar**~~ — ✅ `status-bar.ts`.

## ✅ Recently Fixed (this session)
- [x] **Files show "X more lines" with no expand** — IntersectionObserver auto-loads on scroll.
- [x] **Right-click context menu not working** — CardManager cards now get contextmenu/dblclick/click handlers.
- [x] **Text mode toggle broken** — Now uses `rerenderCurrentView()`.
- [x] **Connections visible by default** — Default OFF, persisted to localStorage.
- [x] **Minimap missing most files** — CardManager path now syncs `ctx.deferredCards`.
- [x] **Canvas cursor stuck on grab** — Defaults to normal, grab only during pan.
- [x] **Selected cards not visually clear** — 3px purple outline with glow.
- [x] **bgrun self-kill on process start** — Zombie sweep skips generic keywords.

## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Import**: Relative `../../packages/galaxydraw/src/core/...` (not package name)
- **Bridge**: `galaxydraw-bridge.ts` — adapter between CanvasState and CanvasContext
- **Key files**: `cards.tsx` (1790 LOC, needs refactoring), `events.tsx`, `canvas.ts`, `repo.tsx`
