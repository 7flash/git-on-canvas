# Galaxy Canvas — Tasks

## ✅ Completed
- [x] 🟢 **Remote repo cloning** — Clone URL input + /api/repo/clone endpoint with shallow clone + caching
- [x] 🟢 **SaaS vs local mode** — /api/repo/mode detects NODE_ENV; SaaS hides local path picker
- [x] 🟡 **Clone UI styling** — Gradient clone button, status indicators, input styling

## 🟡 Improve
- [x] ~~🟡 **Position persistence per user**~~ — ✅ DONE. Migrated from server SQLite to localStorage keyed by `gitcanvas:positions:{repoPath}`. Debounced 300ms saves.
- [x] ~~🟡 **Clone progress streaming**~~ — ✅ DONE. `/api/repo/clone-stream` SSE endpoint spawns `git clone --progress` and streams phase-aware progress (Counting→Compressing→Receiving→Resolving) with percentage. Client shows animated progress bar with accent gradient glow. Falls back to JSON for cached repos.

## 🟢 Feature
- [x] ~~🟢 **User accounts**~~ — ✅ DONE. GitHub OAuth flow (`/api/auth/github` → callback → session cookie). SQLite DB via `sqlite-zod-orm` with users, sessions (30-day TTL), favorites, settings tables. API: `GET /api/auth/me` (profile+favorites+settings), `POST /api/auth/me` (logout), `POST /api/auth/favorites` (add/remove). Sidebar UI: "Sign in with GitHub" button → avatar + name + ⭐ favorite toggle + logout. Client module `lib/user.tsx` manages auth state. DB at `canvas_users.db` (gitignored). Requires `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` env vars.
- [x] ~~🟢 **Shared repositories**~~ — ✅ DONE. Position storage upgraded to dual-mode: server-side SQLite (per user per repo via `repo_positions` table) when logged in, localStorage fallback when anonymous. `POST /api/auth/positions` saves, `GET /api/auth/positions?repo=` loads. Debounced sync (300ms) writes to both localStorage (instant) and server (async fire-and-forget). Multiple users viewing the same cloned repo each get their own independent card layout.
- [x] ~~🟢 **Import from GitHub API**~~ — ✅ DONE. `/api/github/repos` endpoint fetches user/org repos from GitHub API (supports pagination, sorting, rate limit handling). Full modal UI with search, profile display, 2-column repo grid with language dots/stars/size/time-ago, "Clone & Open" buttons that trigger the SSE clone flow. CSS fully styled with glassmorphism modal, spinner, error states, responsive grid.
