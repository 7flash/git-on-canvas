# GitMaps Tasks & Ideas

## 🟡 Priority: Improve
- [x] **galaxydraw demo deployment** — GitHub Actions workflow (`.github/workflows/pages.yml`). Auto-deploys `packages/galaxydraw/demo/` to GitHub Pages on push to main/master. Manual trigger also available.
- [x] **Performance profiling** — 15 benchmarks in `perf.test.ts`. 10K cards: full pipeline 27ms, AABB scan 0.033ms, defer 0.5ms, coordinate math 4.5ns/op. All well within 16ms frame budget.
- [x] **Connection line rendering optimization** — Already implemented. `scheduleRenderConnections()` coalesces rapid calls via `requestAnimationFrame` batching (lines 27-42 of `connections.tsx`).

## 🟢 Priority: Features
- [ ] **Multi-repo workspace** — Currently one repo at a time. Support opening 2-3 repos side-by-side on the same canvas.
- [x] **File preview on hover** — `file-preview.ts` shows glassmorphism tooltip at zoom < 35%: language badge, file name, directory path, first 12 lines of code. 180ms debounce, viewport-clamped positioning.
- [ ] **Branch comparison view** — Side-by-side canvas of two branches, highlighting files that differ.

## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Demo**: `bun run packages/galaxydraw/demo/server.ts` (port 3400)
- **Import**: Use relative path `../../packages/galaxydraw/src/core/...` (not package name) for client code
- **Bridge**: `app/lib/galaxydraw-bridge.ts` — thin adapter between CanvasState and CanvasContext
