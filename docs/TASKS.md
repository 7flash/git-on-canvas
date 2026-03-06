# GitMaps Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Virtualized rendering**~~ — ✅ DONE. `renderAllFilesOnCanvas` now defers cards outside the viewport. React repo (6833 files): 9 DOM cards created, 6824 deferred. ~35ms vs ~14s.
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

**Phase 2** — 🔲 Delegate transforms.
- `updateCanvasTransform()` in `canvas.ts` should call `getGalaxyDrawState()?.applyTransform()` instead of manual `ctx.canvas.style.transform = ...`
- Sync XState zoom/offset → `CanvasState` on every SET_ZOOM/SET_OFFSET event
- Single-line change but needs careful testing (pan, zoom, fit-all, minimap, viewport persistence)

**Phase 3** — 🔲 Replace event handlers.
- `setupCanvasInteraction()` (1500 lines in `events.tsx`) → `GalaxyDraw.setupWheel()` + `setupMouse()` + `setupKeyboard()`
- This is the biggest change — wheel zoom, pan drag, space-to-pan, rect select all move to galaxydraw
- Must preserve: dual control modes, card drag, right-click, perf overlay

**Phase 4** — 🔲 Card system migration.
- `renderAllFilesOnCanvas()` in `cards.tsx` → `CardManager.create()`
- File cards become galaxydraw card plugins
- SVG connections overlay stays (galaxydraw doesn't handle SVG overlays)
- Remove `CanvasContext.canvas` / `canvasViewport` — use `GalaxyDraw.getCanvas()` / `getViewport()`

### WARMAPS Migration
- [ ] Replace WARMAPS `canvas.ts` (616 lines) with `new GalaxyDraw(el, { mode: 'simple' })`
- Blocked on GitMaps migration (proves the engine works first)

## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Demo**: `bun run packages/galaxydraw/demo/server.ts` (port 3400)
- **Import**: Use relative path `../../packages/galaxydraw/src/core/...` (not package name) for client code
- **Bridge**: `app/lib/galaxydraw-bridge.ts` — thin adapter between CanvasState and CanvasContext
