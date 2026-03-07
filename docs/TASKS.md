# GitMaps Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Virtualized rendering**~~ — ✅ DONE. `renderAllFilesOnCanvas` now defers cards outside the viewport. React repo (6833 files): 9 DOM cards created, 6824 deferred. ~35ms vs ~14s.
- [x] ~~**Zoom LOD system**~~ — ✅ DONE. Below zoom 25%, cards render as lightweight colored "pill" placeholders (~3 DOM nodes vs ~100+) instead of full file cards. Throttled materialization (max 30 per frame) prevents frame drops when zooming back in. `viewport-culling.ts` manages LOD transitions.
- [x] ~~**Rename to GitMaps**~~ — ✅ DONE. Header, title, meta, onboarding all say "GitMaps".
- [x] ~~**TypeErrors on init**~~ — ✅ DONE. Added null guards to `updateCanvasTransform`, `updateMinimapViewport`, `setupCanvasInteraction`, `fitAllFiles`, and `clearCanvas`. All now early-return if `ctx.canvas` / `ctx.canvasViewport` is null.
- [x] ~~**Commit select delay**~~ — ✅ RESOLVED by virtualization. Was 8 minutes, now ~542ms (~900x faster). Root cause was re-rendering 6833 DOM cards on every commit select.
- [x] ~~**Shortcuts panel clutter**~~ — ✅ DONE. Replaced 24-row wall of text with compact "?" button + hover popup with 2-column grid layout.
- [x] ~~**Layer bar overlap**~~ — ✅ DONE. Layers bar centered at bottom, minimap at bottom-right, no overlap.

## 🟡 Priority: Improve
- [x] ~~**Dual control modes**~~ — ✅ DONE. Toggle in top toolbar: "Simple" (drag=pan, scroll=zoom) vs "Advanced" (space+drag=pan, rect select). Persists to localStorage.
- [x] ~~**Repo persistence**~~ — ✅ DONE. Auto-loads last repo from localStorage on bare URL visit. Sets hash so URL is shareable.
- [x] ~~**Changed Files popup**~~ — ✅ DONE. Defaults to closed. State persists to localStorage. Toggle button in header opens it manually.

## 🟢 Priority: Features  

### galaxydraw Migration (GitMaps)
Replace custom `canvas.ts` / `events.tsx` (2000+ lines) with `galaxydraw` engine (~400 lines).

**Phase 1** — ✅ DONE. State engine wired.
- Bun workspaces configured (`"galaxydraw": "workspace:*"`)
- `galaxydraw-bridge.ts` created — imports `CanvasState` from `packages/galaxydraw/src/core/state`
- `initGalaxyDrawState(ctx)` called in `page.client.tsx` after DOM refs set
- Uses relative import (Melina bundler doesn't resolve workspace packages)
- **No behavior changes** — existing pan/zoom still works through `canvas.ts`

**Phase 2** — ✅ DONE. Transform delegation.
- `updateCanvasTransform()` calls `getGalaxyDrawState()?.applyTransform()` instead of manual CSS
- Syncs XState zoom/offset → `CanvasState` on every render cycle
- Tested: pan, zoom, fit-all, minimap, viewport persistence — all working

**Phase 3** — 🟡 IN PROGRESS. Replace event handlers.
- ✅ `zoomTowardScreen()` bridge function — replaces 3 duplicated zoom-math blocks in `events.tsx` with single call to `CanvasState.zoomToward()`
- ✅ `panByDelta()` — delegate wheel-scroll pan to `CanvasState.pan()`
- ✅ `screenToWorld()` — delegate coordinate conversion for rect selection to `CanvasState.screenToWorld()`
- ✅ `panTo()` + `panToWorld()` — center viewport on a world point; used by minimap click navigation
- ✅ `Minimap.handleClick()` — reverse-maps minimap click to world coords, supports click+drag pan
- 🔲 Mouse drag pan — uses absolute offset pattern (dragStartX/Y), different from delta-based pan; lower priority
- Must preserve: dual control modes, card drag, right-click, perf overlay

**Phase 4** — 🟡 IN PROGRESS. Card system migration.
- ✅ `FileCardPlugin` + `DiffCardPlugin` — wrap existing `createAllFileCard()` / `createFileCard()` as `CardPlugin` implementations
- ✅ `initCardManager()` — creates CardManager with both plugins, registered on mount
- ✅ EventBus wiring — `card:move` + `card:resize` events sync back to XState
- 🔲 **Phase 4b**: Swap `renderAllFilesOnCanvas()` to use `CardManager.create()` + `CardManager.defer()` instead of direct DOM creation
- 🔲 Replace `CanvasContext.canvas` / `canvasViewport` — use `GalaxyDraw.getCanvas()` / `getViewport()`
- SVG connections overlay stays (galaxydraw doesn't handle SVG overlays)

### WARMAPS Migration
- [ ] Replace WARMAPS `canvas.ts` (616 lines) with `new GalaxyDraw(el, { mode: 'simple' })`
- Blocked on GitMaps migration (proves the engine works first)

## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Demo**: `bun run packages/galaxydraw/demo/server.ts` (port 3400)
- **Import**: Use relative path `../../packages/galaxydraw/src/core/...` (not package name) for client code
- **Bridge**: `app/lib/galaxydraw-bridge.ts` — thin adapter between CanvasState and CanvasContext
