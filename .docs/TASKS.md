# Galaxy Canvas — Tasks

## ✅ Completed
- [x] 🟢 **Remote repo cloning** — Clone URL input + /api/repo/clone endpoint with shallow clone + caching
- [x] 🟢 **SaaS vs local mode** — /api/repo/mode detects NODE_ENV; SaaS hides local path picker
- [x] 🟡 **Clone UI styling** — Gradient clone button, status indicators, input styling

## 🟡 Improve
- [x] ~~🟡 **Position persistence per user**~~ — ✅ DONE. Migrated from server SQLite to localStorage keyed by `gitcanvas:positions:{repoPath}`. Debounced 300ms saves.
- [x] ~~🟡 **Clone progress streaming**~~ — ✅ DONE. `/api/repo/clone-stream` SSE endpoint spawns `git clone --progress` and streams phase-aware progress. Client shows animated progress bar.
- [x] ~~🟡 **Landing page improvement**~~ — ✅ DONE. Added animated grid background with pulsing lines, enhanced hero section with orbital icon, "Explore Popular Repositories" section with 6 curated repos (React, Deno, Svelte, Bun, Next.js, TailwindCSS). Click-to-clone on repo cards. Wired into existing clone flow via `events.tsx`.
- [x] ~~**Featured repos — dynamic stats**~~ — ✅ DONE. Star counts fetched from GitHub API at render time via `getFeaturedRepos()`. 5-minute server-side cache. Graceful fallback to hardcoded values if API unavailable.
- [x] ~~**Onboarding flow**~~ — ✅ DONE. Interactive tutorial highlighting canvas controls after first clone, using `app/lib/onboarding.tsx`.

## 🟢 Feature
- [x] ~~🟢 **User accounts**~~ — ✅ DONE. GitHub OAuth flow.
- [x] ~~🟢 **Shared repositories**~~ — ✅ DONE. Position storage dual-mode.
- [x] ~~🟢 **Import from GitHub API**~~ — ✅ DONE. Full modal UI with search, clone.
- [x] ~~**AI-powered code explanation**~~ — ✅ DONE. Click a file card and ask the AI about it. Sends file content + connections context to Gemini for architecture analysis.
- [x] ~~**Share canvas layouts**~~ — ✅ DONE. Export/import canvas state as a shareable URL parameters. Layout payloads are base64-encoded to share viewports, hidden files, card positions and sizes instantly.
- [x] ~~**Diff visualization on canvas**~~ — ✅ DONE. When navigating commits, show visual diffs directly on cards (added/removed lines highlighted in green/red).
- [x] ~~**Replayable Onboarding**~~ — ✅ DONE. Added a "?" button to the top toolbar that replays the interactive onboarding tour.
- [x] ~~**Local Drag-and-Drop**~~ — ✅ DONE. Support dragging a local directory drop to upload it mapping files to canvas without Git clone.
- [x] ~~**Canvas search / find**~~ — ✅ DONE. Upgraded `Ctrl+F` global search from simple path-matching to deep content-matching across all active files. Implemented inline snippet previews with highlighting and scroll-to-line navigation.
- [x] ~~**Commit tree visualization**~~ — ✅ DONE. Implemented a visual Git commit/branch graph overlay, replacing the simple standard commit dropdown menu for better project archaeology. Added topological lane sorting and SVG drawing inside the commit timeline.
- [x] ~~**Multi-select & bulk operations**~~ — ✅ DONE. Dragging a selection box over multiple cards brings up the Arrange toolbar. Bulk actions (collapse, resize) already work. Wired up "Explain with AI" to automatically ingest *only* the selected file cards into the AI context for batch processing.

## 🔴 Priority: Performance
- [x] ~~**Canvas/WebGL text rendering**~~ — ✅ DONE. Developed `CanvasTextRenderer` to bypass DOM spans for file cards > 10,000 lines. The renderer uses virtualization to achieve stable 60 FPS panning even during large diff highlights, preserving styles and background layouts.
- [x] ~~**Viewport culling**~~ — ✅ DONE. 94% DOM reduction during normal pan/zoom.

## 🟡 Improve
- [x] ~~**Performance measurement dashboard**~~ — ✅ DONE. Live FPS with sparkline graph, DOM count, zoom %, heap memory.
- [x] ~~**Connection rendering performance**~~ — ✅ DONE. rAF coalescing.
- [x] ~~**Folding state persistence**~~ — ✅ DONE. Unified expanded state into positions system.

## 📝 Architecture Notes
- **Dev server**: `bgrun --name galaxy-canvas --command "bun run dev" --directory "c:\Code\galaxy-canvas"` on port 3335
- **Client orchestrator**: `app/page.client.tsx` → imports modules from `app/lib/`
- **State**: XState machine in `app/state/machine.js`
- **Canvas**: Direct DOM manipulation for performance (no VDOM for file cards)
- **Landing page**: `app/page.tsx` (server-rendered), styles in `app/globals.css`
- **Rendering**: Viewport culling + line-limiting for large files, VISIBLE_LINE_LIMIT=120
