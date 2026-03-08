# GitMaps Tasks & Ideas

## 🟡 Priority: Improve
- [x] **galaxydraw demo deployment** — GitHub Actions workflow (`.github/workflows/pages.yml`). Auto-deploys `packages/galaxydraw/demo/` to GitHub Pages on push to main/master. Manual trigger also available.
- [ ] **Performance profiling** — Large repos (6800+ files) work but haven't been profiled recently. Benchmark materialization times and memory usage after Phase 4.
- [ ] **Connection line rendering optimization** — SVG connections recalculate on every card move. Batch rerenders with requestAnimationFrame.

## 🟢 Priority: Features
- [ ] **Multi-repo workspace** — Currently one repo at a time. Support opening 2-3 repos side-by-side on the same canvas.
- [ ] **File preview on hover** — Show a mini code preview tooltip when hovering over a file card at low zoom, without needing to double-click.
- [ ] **Branch comparison view** — Side-by-side canvas of two branches, highlighting files that differ.

## 📝 Architecture Notes
- **Framework**: galaxydraw lives in `packages/galaxydraw/`
- **Dev**: `bgrun --restart galaxy-canvas` (port 3335)
- **Demo**: `bun run packages/galaxydraw/demo/server.ts` (port 3400)
- **Import**: Use relative path `../../packages/galaxydraw/src/core/...` (not package name) for client code
- **Bridge**: `app/lib/galaxydraw-bridge.ts` — thin adapter between CanvasState and CanvasContext
