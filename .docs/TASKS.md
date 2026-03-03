# Galaxy Canvas — Tasks

## ✅ Completed
- [x] 🟢 **Remote repo cloning** — Clone URL input + /api/repo/clone endpoint with shallow clone + caching
- [x] 🟢 **SaaS vs local mode** — /api/repo/mode detects NODE_ENV; SaaS hides local path picker
- [x] 🟡 **Clone UI styling** — Gradient clone button, status indicators, input styling

## 🟡 Improve
- [x] ~~🟡 **Position persistence per user**~~ — ✅ DONE. Migrated from server SQLite to localStorage keyed by `gitcanvas:positions:{repoPath}`. Debounced 300ms saves.
- [x] ~~🟡 **Clone progress streaming**~~ — ✅ DONE. `/api/repo/clone-stream` SSE endpoint spawns `git clone --progress` and streams phase-aware progress (Counting→Compressing→Receiving→Resolving) with percentage. Client shows animated progress bar with accent gradient glow. Falls back to JSON for cached repos.

## 🟢 Feature
- [ ] 🟢 **User accounts** — Auth for storing favorites, filters, portfolio positions
- [ ] 🟢 **Shared repositories** — Multiple users can view same cloned repo with individual positions
- [ ] 🟢 **Import from GitHub API** — Auto-discover repos from GitHub username/org
