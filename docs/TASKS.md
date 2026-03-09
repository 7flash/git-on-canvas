# GitMaps Tasks & Ideas

## 🟡 Priority: Improve
- [x] **galaxydraw demo deployment** — GitHub Actions workflow (`.github/workflows/pages.yml`). Auto-deploys `packages/galaxydraw/demo/` to GitHub Pages on push to main/master. Manual trigger also available.
- [x] **Performance profiling** — 15 benchmarks in `perf.test.ts`. 10K cards: full pipeline 27ms, AABB scan 0.033ms, defer 0.5ms, coordinate math 4.5ns/op. All well within 16ms frame budget.
- [x] **Connection line rendering optimization** — Already implemented. `scheduleRenderConnections()` coalesces rapid calls via `requestAnimationFrame` batching (lines 27-42 of `connections.tsx`).

## 🟢 Priority: Features
- [ ] **Multi-repo workspace** — Currently one repo at a time. Support opening 2-3 repos side-by-side on the same canvas.
- [x] **File preview on hover** — `file-preview.ts` shows glassmorphism tooltip at zoom < 35%: language badge, file name, directory path, first 12 lines of code. 180ms debounce, viewport-clamped positioning.
- [ ] **Branch comparison view** — Side-by-side canvas of two branches, highlighting files that differ.

## 🔴 Priority: Fix
- [x] ~~**Repeated "Loaded 100 commits" toasts**~~ — ✅ DONE. Added `_loadingRepo` dedup guard in `repo.tsx` that prevents concurrent/duplicate `loadRepository` calls for the same path. Multiple mount triggers (URL hash + localStorage) now coalesce into a single load.
- [x] ~~**Commit timeline sidebar empty after load**~~ — ✅ DONE. The initial `renderCommitTimeline` call was getting clobbered by DOM changes during `loadAllFiles`/`selectCommit`. Added a defensive second render after all async work completes.

## 🟡 Priority: Improve
- [x] **Pan/zoom materialization performance** — Reduced `MAX_MATERIALIZE_PER_FRAME` 30→8 and added 150ms cooldown (`markTransformActive`) to skip card creation during active pan/zoom.
- [x] ~~**XState snapshot caching**~~ — ✅ DONE. `getVisibleWorldRect` returns `zoom` alongside the rect, eliminating a redundant `ctx.snap()` in `performViewportCulling`. One snapshot per culling frame instead of two.
- [x] ~~**Large repo initial render**~~ — ✅ DONE. Hoisted `ctx.snap().context.cardSizes` out of the per-file loop in both `renderAllFilesViaCardManager` and the legacy fallback. Previously called N snapshots for N files; now 1 snapshot total. Virtualization already handled (12 DOM nodes created for 11K+ file Deno repo).


## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Demo**: `bun run packages/galaxydraw/demo/server.ts` (port 3400)
- **Import**: Use relative path `../../packages/galaxydraw/src/core/...` (not package name) for client code
- **Bridge**: `app/lib/galaxydraw-bridge.ts` — thin adapter between CanvasState and CanvasContext
