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
- [x] ~~**File hover preview in zoomed-out mode**~~ — ✅ DONE. When zoomed out to pill/LOD mode (<35% zoom), hovering over a pill card shows a full-fidelity file card preview popup. The preview clones the exact card component (syntax highlighting, diff markers, status badges) and forces DOM rendering even when canvas-text mode is active. Debounced 180ms with smooth fade animation.
- [x] ~~**Inline file editing**~~ — ✅ DONE. Edit tab in file preview modal with textarea, Ctrl+S save via POST /api/repo/file-save, cursor tracking, modified/saved status indicators. Path traversal protection.

## 🟡 Open Tasks
- [x] ~~**File editing: syntax highlighting**~~ — ✅ DONE. CodeMirror 6 replaces textarea. Custom dark theme, language support for JS/TS/JSX/TSX/CSS/HTML/JSON/MD/Python/YAML. Line numbers, fold gutters, bracket matching, search, cursor tracking.
- [x] ~~**File editing: git integration**~~ — ✅ DONE. After saving, inline commit section slides in with pre-filled message, POST /api/repo/git-commit stages + commits, shows commit hash.
- [x] ~~**File editing: unsaved changes warning**~~ — ✅ DONE. Confirm dialog when closing modal or switching tabs with unsaved edits.
- [x] ~~**File editing: create new file**~~ — ✅ DONE. Ctrl+N opens dialog. Smart templates per extension. Auto-creates dirs and opens in edit mode.
- [x] ~~**File operations: delete file**~~ — ✅ DONE. Context menu "🗑️ Delete file" with confirmation dialogs. POST /api/repo/file-delete with optional git rm. Auto-cleans empty dirs. Removes card from canvas.
- [x] ~~**File operations: rename/move**~~ — ✅ DONE. Context menu "✏️ Rename / Move" with prompt. POST /api/repo/file-rename uses git mv (preserves history) with fs.rename fallback. Re-keys all internal maps.
- [x] ~~**Go-to-definition**~~ — ✅ DONE. Import paths in Full view are clickable (dashed underline). Click navigates to target file's card on canvas with green pulse highlight. Resolves relative paths with extension/index fallbacks. Ctrl+Click also works.
- [x] ~~**Code minimap in editor**~~ — ✅ DONE. Custom `ViewPlugin` minimap extension in `code-editor.ts`. 60px canvas-rendered minimap with heuristic syntax coloring (keywords/strings/comments/numbers), HiDPI support, draggable viewport indicator with purple accent, auto-updates on scroll/edit. Zero dependencies.
- [x] ~~**Multi-tab editor**~~ — ✅ DONE. Tab bar with file icons, names, close buttons. Ctrl+Tab/Ctrl+Shift+Tab cycling, middle-click close, scroll position per tab. Go-to-definition opens as new tab.
- [x] ~~**File breadcrumb navigation**~~ — ✅ DONE. Clickable directory segments in modal header. Click opens dropdown with sibling files/dirs. Drill into subdirs. Opens files as new tabs.
- [x] ~~**Git blame view**~~ — ✅ DONE. "Blame" tab with porcelain API. Color-coded authors, grouped commits, relative timestamps, author legend, cached data.
- [x] ~~**File diff between tabs**~~ — ✅ DONE. `tab-diff.ts` (210 lines) with LCS-based diff algorithm, side-by-side synced scroll, change markers (+/−), glassmorphic overlay. Auto-diffs 2 tabs, picker for 3+. "⇄ Diff" button in tab bar.
- [x] ~~**Symbol outline panel**~~ — ✅ Already existed. `symbol-outline.ts` (213 lines) extracts functions/classes/interfaces/types/enums from JS/TS/Python/CSS/JSON/Markdown. Rendered in file modal with color-coded icons and click-to-scroll.
- [x] ~~**Keyboard shortcuts overlay**~~ — ✅ Already existed. `shortcuts-panel.ts` implements `?` hotkey with glassmorphism cheat sheet.
- [x] ~~**Remove comment feature**~~ — ✅ DONE. Stripped pr-review.ts and all references from canvas-text.ts, page.client.tsx. Comment popups no longer interfere with connections.
- [x] ~~**URL routing: path-based**~~ — ✅ DONE. Changed from `#slug` hash to `/slug` path routing. Dynamic `[slug]/page.tsx` route. Legacy hash URLs auto-migrate. `popstate` replaces `hashchange`.
- [x] ~~**Remove SQLite tables**~~ — ✅ DONE. Deleted `/api/connections` and `/api/positions` SQLite routes. Connections now use localStorage keyed by repo path (`gitcanvas:connections:{repoPath}`).
- [x] ~~**Landing page: dimensional metaphor**~~ — ✅ DONE. Redesigned to tell the 4D story: 1D (Lines) → 2D (Canvas/transclusion) → 3D (Layers/z-axis) → Connections (knots) → 4D (Git/time). Plus "AI code review at scale" pitch section.
- [x] ~~**Default layer renamed**~~ — ✅ DONE. "All Files (Default)" → "Main". Context menu "Remove from Layer" → "↩ Move to Main".
- [x] ~~**Delete api/repo/browse**~~ — ✅ DONE. Unused endpoint removed.
- [x] ~~**File preview: 120-line limit**~~ — ✅ DONE. Preview popup now renders with `isExpanded=true` to show ALL lines, not just the first 120.

## 🔴 Priority: Fix
- [x] ~~**File preview: popup visibility**~~ — ✅ DONE. Root cause: cards in pill mode have `display:none`, cloning them produced zero-size popup. Added `display:block` to cloned card.
- [x] ~~**File preview: scrollable content**~~ — ✅ DONE. Popup stays stationary (no cursor-chasing), wheel events forwarded from viewport to popup when preview is visible.
- [ ] **Changed files panel empty** — After selecting a commit, the changed files panel shows nothing. Needs investigation.
- [ ] **Connections creation UX** — Connections work via Alt+click to start, then click another file's line. The comment popup interference is now fixed (pr-review removed). Need to verify and improve discoverability.
- [x] ~~**Wheel event hijacking**~~ — ✅ DONE. `onViewportWheel` in `file-preview.ts` used to intercept wheel events over pills; disabled it so two-finger trackpad panning on canvas works perfectly.
- [x] ~~**G hotkey overlaps in zoomed-out mode**~~ — ✅ DONE. Grid arrangement now accounts for `display: none` or short pill heights by defaulting to `580x700`.
- [ ] **Ctrl+A select all files** — Not implemented. Should select all visible file cards on the canvas.

## 🟡 Open Tasks
- [ ] **Migrate execAsync → Bun.$** — Several API routes use `execAsync` from `child_process`. Should use `Bun.$` for cleaner shell commands.
- [ ] **Migrate child_process → Bun.spawn** — Replace `child_process` usage with native `Bun.spawn` for process management.
- [ ] **Dependency graph view** — File dependency visualization started but may need polish. Verify force-directed graph, SVG connection rendering, and toggle button.
- [ ] **Production SaaS deploy** — Set up production deployment (Vercel/Fly.io/VPS). Currently only runs locally on port 3335.
- [ ] **Card groups: directory collapse** — Card grouping collapses directories into summary cards. Verify persistence and animations.
- [ ] **Rename galaxydraw → xydraw** — Publish the canvas engine as `xydraw` on npm. Rename all references.

## 🔴 Priority: Performance
- [x] ~~**Canvas/WebGL text rendering**~~ — ✅ DONE. Developed `CanvasTextRenderer` to bypass DOM spans for file cards > 10,000 lines. The renderer uses virtualization to achieve stable 60 FPS panning even during large diff highlights, preserving styles and background layouts.
- [x] ~~**Viewport culling**~~ — ✅ DONE. 94% DOM reduction during normal pan/zoom.

## 🟡 Improve
- [x] ~~**Performance measurement dashboard**~~ — ✅ DONE. Live FPS with sparkline graph, DOM count, zoom %, heap memory.
- [x] ~~**Connection rendering performance**~~ — ✅ DONE. rAF coalescing.
- [x] ~~**Folding state persistence**~~ — ✅ DONE. Unified expanded state into positions system.
- [x] ~~**Minimap: update on card drag**~~ — ✅ DONE. Added `forceMinimapRebuild()` call after card/pill drag ends in both `cards.tsx` and `viewport-culling.ts`.
- [x] ~~**Minimap: proper rectangles for pills**~~ — ✅ DONE. Fixed fallback height from 200→700 when cards are hidden in pill mode.
- [x] ~~**Layer bar: show active layer**~~ — ✅ DONE. Non-active layers hidden when not hovered; active layer always visible.
- [x] ~~**G/H/V hotkeys in pill mode**~~ — ✅ DONE. Fixed `.file-card-pill` → `.file-pill` selector mismatch in `card-arrangement.ts`.
- [x] ~~**Search: jump to file instead of editor**~~ — ✅ DONE. Clicking a search result navigates to the card on canvas (with layer switch) and scrolls to the matching line.
- [x] ~~**Search: persist state**~~ — ✅ DONE. Panel hides instead of destroying on result click, restoring query/results when reopened.

## 📌 Future Ideas
- [ ] 🟢 **Shared layout sessions** — Replace current cursor tracking (broken: each user has own layout). Instead: share a link with unique session ID → recipients join read-only view of your layout.

## 📝 Architecture Notes
- **Dev server**: `bgrun --name gitmaps` on port 3335
- **Client orchestrator**: `app/page.client.tsx` → imports modules from `app/lib/`
- **State**: XState machine in `app/state/machine.js`
- **Canvas**: Direct DOM manipulation for performance (no VDOM for file cards)
- **Landing page**: `app/page.tsx` (server-rendered), styles in `app/globals.css`
- **Rendering**: Viewport culling + line-limiting for large files, VISIBLE_LINE_LIMIT=120
- **URL routing**: Path-based (`/slug`) with `[slug]/page.tsx` dynamic route. Legacy `#slug` auto-migrates.
- **Storage**: All client state in localStorage (positions, connections, layers, hidden files)
