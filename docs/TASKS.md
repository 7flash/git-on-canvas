# GitMaps Tasks & Ideas

## 🟡 Priority: Improve
- [x] **galaxydraw demo deployment** — GitHub Actions workflow (`.github/workflows/pages.yml`). Auto-deploys `packages/galaxydraw/demo/` to GitHub Pages on push to main/master. Manual trigger also available.
- [x] **Performance profiling** — 15 benchmarks in `perf.test.ts`. 10K cards: full pipeline 27ms, AABB scan 0.033ms, defer 0.5ms, coordinate math 4.5ns/op. All well within 16ms frame budget.
- [x] **Connection line rendering optimization** — Already implemented. `scheduleRenderConnections()` coalesces rapid calls via `requestAnimationFrame` batching (lines 27-42 of `connections.tsx`).
- [x] **Pill cards: vertical text** — Pill cards now show full file names as rotated text (48px world-space, readable at 8-20% zoom). Uses CSS `transform: rotate(-90deg)` instead of `writing-mode: vertical-lr` which rendered Latin text char-by-char.
- [x] **Minimap: show all files** — Minimap now includes deferred cards in bounds + dots. Previously only showed files with DOM elements (viewport-visible).
- [x] **Fit All: include deferred cards** — `fitAllFiles` now accounts for deferred card positions in its bounding box calculation.
- [x] **"Press F" label removed** — Replaced with "double-click to zoom" since F-key expand is no longer primary.
- [x] **Pill card label disambiguation** — Pills for common filenames (route.ts, page.tsx, index.ts etc.) now show parent directory: `messages/route.ts` instead of just `route.ts`. Massively improves readability in API-heavy repos.

## 🟢 Priority: Features
- [x] ~~**Multi-repo workspace**~~ — ✅ DONE. `multi-repo.ts` supports 2-3 repos side-by-side. Additional repos auto-offset 800px right. Sidebar tabs switch commit timeline between repos. Zone labels (floating world-space badges with color dots) identify each repo's area. Color-coded: purple, blue, emerald, amber, red.
- [x] **File preview on hover** — `file-preview.ts` shows glassmorphism tooltip at zoom < 35%: language badge, file name, directory path, first 12 lines of code. 180ms debounce, viewport-clamped positioning.
- [x] ~~**Branch comparison view**~~ — ✅ ALREADY DONE. `branch-compare.ts` has full glassmorphism drawer with base/compare branch pickers, swap button, summary with status badges, and renders diff cards on canvas. Wired up via `initBranchCompare(ctx)` in `page.client.tsx`.
- [x] **Command Palette (Ctrl+K)** — `command-palette.ts`: Fuzzy file search overlay with glassmorphism design. Subsequence matching with consecutive/word-boundary/case bonuses. Arrow keys navigate, Enter jumps to file (animated zoom+highlight), Escape closes. Shows all files with path context. Purple character highlighting on matches.
- [x] **Keyboard Shortcuts Panel (?)** — `shortcuts-panel.ts`: Press ? to show a 2-column reference of all 18 keyboard shortcuts across 4 categories (Navigation, Selection, Cards, Tools). Glassmorphism overlay with animated entrance. Escape or backdrop click to close.
- [x] ~~**GitHub import modal enhancement**~~ — ✅ DONE. Removed sidebar clone URL field. Modal now supports: (1) URL detection — paste a GitHub URL and it shows repo name + instant Clone & Open button, (2) username/org search with profile display, (3) live repo filter input to search within loaded results by name/description. Enter on URL auto-clones, Enter on username auto-searches.
- [x] ~~**Production security**~~ — ✅ DONE. Created `validate-path.ts` with `validateRepoPath()` and `blockInProduction()`. In SaaS mode, only `git-canvas/repos/` and `.data/uploads/` paths are allowed. Applied to all 7 repo API routes. Folder browser endpoint completely blocked in production.
- [x] ~~**Smooth LOD transition**~~ — ✅ DONE. Pills now fade in with `scale(0.92)→scale(1)` + `opacity 0→0.9` animation (250ms). Pill→Full: pills fade out before removal. Full→Pill: cards fade out then hide. Cards entering viewport from culled state also fade in. All CSS transition-based for GPU acceleration.
- [x] ~~**Multi-file drag**~~ — ✅ ALREADY DONE. `setupCardInteraction` collects all `selectedCards` on drag start and moves them as a group. Pill mode also supports multi-drag via `pillMoveInfos`. Ctrl/Shift+click to multi-select, then drag any selected card.

## 🔴 Priority: Fix
- [x] ~~**Repeated "Loaded 100 commits" toasts**~~ — ✅ DONE. Added `_loadingRepo` dedup guard in `repo.tsx` that prevents concurrent/duplicate `loadRepository` calls for the same path.
- [x] ~~**Commit timeline sidebar empty after load**~~ — ✅ DONE. Added defensive second render after all async work completes.
- [x] ~~**Page "shivering" on refresh**~~ — ✅ DONE. Used `history.replaceState` instead of `window.location.hash =` to avoid triggering `hashchange` → duplicate `loadRepository`.
- [x] ~~**Double-click opens modal**~~ — ✅ DONE. Double-click now calls `jumpToFile` for animated zoom-to-file. Modal accessible via right-click context menu.
- [x] ~~**Panning broken in simple mode**~~ — ✅ DONE. Reverted rogue change. Simple = pan, Advanced = rect select.
- [x] ~~**Changed files panel: no animation**~~ — ✅ DONE. Now uses `jumpToFile` for smooth animated zoom+pan navigation.
- [x] **Commit graph lane algorithm** — Fixed lane clearing: commit clears its own reservation before assigning parents, preventing visual ordering bugs with merge commits.

## 🟡 Priority: Improve (done)
- [x] **Pan/zoom materialization performance** — Reduced `MAX_MATERIALIZE_PER_FRAME` 30→8 and added 150ms cooldown.
- [x] **XState snapshot caching** — `getVisibleWorldRect` returns `zoom` alongside the rect, eliminating redundant `ctx.snap()`.
- [x] **Large repo initial render** — Hoisted `ctx.snap().context.cardSizes` out of per-file loop.

## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Demo**: `bun run packages/galaxydraw/demo/server.ts` (port 3400)
- **Import**: Use relative path `../../packages/galaxydraw/src/core/...` (not package name) for client code
- **Bridge**: `app/lib/galaxydraw-bridge.ts` — thin adapter between CanvasState and CanvasContext
