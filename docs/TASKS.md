# GitMaps Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Virtualized rendering**~~ — ✅ DONE. `renderAllFilesOnCanvas` now defers cards outside the viewport. React repo (6833 files): 9 DOM cards created, 6824 deferred. ~35ms vs ~14s.
- [x] ~~**Rename to GitMaps**~~ — ✅ DONE. Header, title, meta, onboarding all say "GitMaps".
- [ ] **TypeErrors on init** — `updateCanvasTransform` and `setupCanvasInteraction` fire before DOM is ready. Race condition between script load and DOM mount.
- [x] ~~**Commit select delay**~~ — ✅ RESOLVED by virtualization. Was 8 minutes, now ~542ms (~900x faster). Root cause was re-rendering 6833 DOM cards on every commit select.
- [x] ~~**Shortcuts panel clutter**~~ — ✅ DONE. Replaced 24-row wall of text with compact "?" button + hover popup with 2-column grid layout.
- [x] ~~**Layer bar overlap**~~ — ✅ DONE. Layers bar centered at bottom, minimap at bottom-right, no overlap.

## 🟡 Priority: Improve
- [x] ~~**Dual control modes**~~ — ✅ DONE. Toggle in top toolbar: "Simple" (drag=pan, scroll=zoom) vs "Advanced" (space+drag=pan, rect select). Persists to localStorage.
- [x] ~~**Repo persistence**~~ — ✅ DONE. Auto-loads last repo from localStorage on bare URL visit. Sets hash so URL is shareable.
- [x] ~~**Changed Files popup**~~ — ✅ DONE. Defaults to closed. State persists to localStorage. Toggle button in header opens it manually.

## 🟢 Priority: Features  
- [ ] **galaxydraw migration** — Replace custom canvas.ts/events.tsx with `new GalaxyDraw(el, { mode: 'advanced' })`.
- [ ] **WARMAPS migration** — Replace WARMAPS canvas.ts with `new GalaxyDraw(el, { mode: 'simple' })`.

## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Demo**: `bun run packages/galaxydraw/demo/server.ts` (port 3400)
