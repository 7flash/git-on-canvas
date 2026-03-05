# Galaxy Canvas — Tasks

## ✅ Completed
- [x] 🟢 **Remote repo cloning** — Clone URL input + /api/repo/clone endpoint with shallow clone + caching
- [x] 🟢 **SaaS vs local mode** — /api/repo/mode detects NODE_ENV; SaaS hides local path picker
- [x] 🟡 **Clone UI styling** — Gradient clone button, status indicators, input styling

## 🟡 Improve
- [x] ~~🟡 **Position persistence per user**~~ — ✅ DONE. Migrated from server SQLite to localStorage keyed by `gitcanvas:positions:{repoPath}`. Debounced 300ms saves.
- [x] ~~🟡 **Clone progress streaming**~~ — ✅ DONE. `/api/repo/clone-stream` SSE endpoint spawns `git clone --progress` and streams phase-aware progress. Client shows animated progress bar.
- [x] ~~🟡 **Landing page improvement**~~ — ✅ DONE. Added animated grid background with pulsing lines, enhanced hero section with orbital icon, "Explore Popular Repositories" section with 6 curated repos (React, Deno, Svelte, Bun, Next.js, TailwindCSS). Click-to-clone on repo cards. Wired into existing clone flow via `events.tsx`.
- [ ] **Featured repos — dynamic stats** — Currently star counts and language info are hardcoded in `page.tsx`. Fetch real stats from GitHub API on server-side `/api/github/featured` to keep numbers fresh.
- [ ] **Onboarding flow** — After cloning a repo, show a brief interactive tutorial highlighting canvas controls (pan, zoom, drag, connect, layers). First-time user experience.

## 🟢 Feature
- [x] ~~🟢 **User accounts**~~ — ✅ DONE. GitHub OAuth flow.
- [x] ~~🟢 **Shared repositories**~~ — ✅ DONE. Position storage dual-mode.
- [x] ~~🟢 **Import from GitHub API**~~ — ✅ DONE. Full modal UI with search, clone.
- [ ] **AI-powered code explanation** — Click a file card and ask the AI about it. Send file content + connections context to Gemini for architecture analysis.
- [ ] **Share canvas layouts** — Export/import canvas state as a shareable URL or JSON. Useful for code review handoffs.
- [ ] **Diff visualization on canvas** — When navigating commits, show visual diffs directly on cards (added/removed lines highlighted in green/red).

## 🔴 Priority: Performance
- [ ] **Canvas/WebGL text rendering** — Explore rendering file card text content via `<canvas>` or WebGL instead of DOM spans for 10K+ line files.
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
