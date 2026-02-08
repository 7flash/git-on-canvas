# Git Canvas v2 — XState Refactor & Canvas Modes

## Phase 1: XState + State Machine Core
- Install xstate
- Create `app/state/machine.js` with states:
  - **repo**: idle → loading → loaded → error
  - **view**: commits | allfiles (parallel, don't hide commits sidebar)
  - **canvasMode**: pan (1) | select (2) | resize (3) | connect (4)  
  - **connection**: idle → selectingSource → selectingTarget → editing → saved
- Wire hotkeys 1-2-3-4 for canvas mode switching
- Cursor changes per mode (grab, pointer, nw-resize, crosshair)

## Phase 2: URL-based Repo + Folder Picker
- Server endpoint `/api/repo/browse` opens OS folder dialog (PowerShell)
- URL stores repo path in hash: `#/repo/C:/path/to/repo`
- On page load check URL hash, auto-load repo
- "Browse" button triggers picker, sets input + URL

## Phase 3: View Mode Refactor
- Commits and All Files are separate panels, not mutually exclusive
- Commits sidebar always visible
- All Files is a canvas mode (the actual canvas shows all files or commit diff)
- Loading repo respects current viewMode

## Phase 4: Scroll Position Persistence
- On scroll of any file card body, debounce-save scrollTop to positions store
- Key: `scroll:${filePath}` 
- On render, restore scrollTop from positions

## Phase 5: Canvas Modes
### Mode 1 — Pan (default, hotkey 1)
- Current behavior: drag empty space to pan, scroll to zoom
### Mode 2 — Select & Move (hotkey 2)  
- Click cards to select (multi-select with Shift)
- Drag selected cards to move them
- Selection box for bulk select
### Mode 3 — Resize (hotkey 3)
- Drag card edges to resize width/height
- Persist sizes per file
### Mode 4 — Connect (hotkey 4)
- Click line ranges in one file card to start connection
- Click line range in another file to complete
- Optional comment dialog
- SVG lines drawn between connected ranges
- Click a highlighted range → camera zooms to target

## Phase 6: Connections Data Model
- Store in positions API or separate connections API
- Schema: { id, sourceFile, sourceLineStart, sourceLineEnd, targetFile, targetLineStart, targetLineEnd, comment }
- Render as SVG overlay on canvas
- Highlighted line ranges with hover effects
