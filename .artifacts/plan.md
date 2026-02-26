# Git Canvas v2 — XState Refactor & Canvas Modes

## Phase 1: XState + State Machine Core ✅
- Install xstate
- Create `app/state/machine.js` with states:
  - **repo**: idle → loading → loaded → error
  - **view**: commits | allfiles (parallel, don't hide commits sidebar)
  - **canvasMode**: pan (1) | select (2) | resize (3) | connect (4)  
  - **connection**: idle → selectingSource → selectingTarget → editing → saved
- Wire hotkeys 1-2-3-4 for canvas mode switching
- Cursor changes per mode (grab, pointer, nw-resize, crosshair)

## Phase 2: URL-based Repo + Folder Picker ✅
- Server endpoint `/api/repo/browse` opens OS folder dialog (PowerShell)
- URL stores repo path in hash: `#/repo/C:/path/to/repo`
- On page load check URL hash, auto-load repo
- "Browse" button triggers picker, sets input + URL

## Phase 3: View Mode Refactor ✅
- Commits and All Files are separate panels, not mutually exclusive
- Commits sidebar always visible
- All Files is a canvas mode (the actual canvas shows all files or commit diff)
- Loading repo respects current viewMode

## Phase 4: Scroll Position Persistence ✅
- On scroll of any file card body, debounce-save scrollTop to positions store
- Key: `scroll:${filePath}` 
- On render, restore scrollTop from positions

## Phase 5: Canvas Modes ✅
### Mode 1 — Pan (default, hotkey 1)
- Current behavior: drag empty space to pan, scroll to zoom
### Mode 2 — Select & Move (hotkey 2)  
- Click cards to select (multi-select with Shift)
- Drag selected cards to move them
- Selection box for bulk select
### Mode 3 — Resize (hotkey 3)
- Drag card edges to resize width/height
- Persist sizes per file
- Dynamic corner hit area (scales with card size)
- Multi-select resize
- F hotkey: fit to content
- W hotkey: fit to screen
### Mode 4 — Connect (hotkey 4)
- Drag connect button to target card
- Connection dialog with line ranges + comment
- SVG bezier curves between connected ranges
- Click connection → navigate to target
- Connections persist in SQLite

## Phase 6: Connections Data Model ✅
- Stored in dedicated `/api/connections` endpoint with SQLite
- Schema: { conn_id, source_file, source_line_start, source_line_end, target_file, target_line_start, target_line_end, comment }
- Render as SVG overlay on canvas
- Interactive: hover glow, click to navigate
- Highlighted line ranges with flash animation

## Phase 7: UI Polish (completed during phases)
- Minimap: resizable, hover tooltips, click-to-navigate
- All-files mode: changed files as diff cards, no transparency dimming
- Hidden lines indicator (↓ N more lines)
- Right-click context menu (Expand, Fit content, Fit screen, File history)
- File history panel (per-file commit log)
- Changed files panel with diff stats (+/- per file, click to navigate)
- Card flash animation for navigation feedback
- Hotkey legend updated (F, W)
- bgrun workflow for running dev server
