# GitMaps Tasks & Ideas

## 🔴 Priority: Fix
- [x] ~~**Virtualized rendering**~~ — ✅ DONE. `renderAllFilesOnCanvas` now defers cards outside the viewport. React repo (6833 files): 9 DOM cards created, 6824 deferred. ~35ms vs ~14s.
- [x] ~~**Rename to GitMaps**~~ — ✅ DONE. Header, title, meta, onboarding all say "GitMaps".
- [ ] **TypeErrors on init** — `updateCanvasTransform` and `setupCanvasInteraction` fire before DOM is ready. Race condition between script load and DOM mount.
- [ ] **Commit select 8-minute delay** — `commit:select` takes ~8 minutes for React repo. Need profiling — likely server-side git diff of all 6833 files.
- [x] ~~**Shortcuts panel clutter**~~ — ✅ DONE. Replaced 24-row wall of text with compact "?" button + hover popup with 2-column grid layout.
- [x] ~~**Layer bar overlap**~~ — ✅ DONE. Layers bar centered at bottom, minimap at bottom-right, no overlap.

## 🟡 Priority: Improve
- [ ] **Dual control modes** — "Simple" (drag = pan) vs "Advanced" (space+drag = pan). Toggle in top settings. Framework supports it via galaxydraw.
- [ ] **Repo persistence** — Previously selected repos should restore from localStorage on reload. Code exists (`gitcanvas:lastRepo`) but may not be triggering properly.
- [ ] **Changed Files popup** — Auto-opens on commit select and blocks the canvas. Should be dismissible and remember state.

## 🟢 Priority: Features  
- [ ] **galaxydraw migration** — Replace custom canvas.ts/events.tsx with `new GalaxyDraw(el, { mode: 'advanced' })`.
- [ ] **WARMAPS migration** — Replace WARMAPS canvas.ts with `new GalaxyDraw(el, { mode: 'simple' })`.

## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Demo**: `bun run packages/galaxydraw/demo/server.ts` (port 3400)
