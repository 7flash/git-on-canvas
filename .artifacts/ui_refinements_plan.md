# Implementation Plan - UI/UX Refinements

## Changes Made

### 1. Hunk Scrolling
- **Modified `app/main.js`**: Relaxed the mouse wheel event handler to prioritize scrolling over zooming when hovering over a scrollable hunk pane. This ensures that users can naturally scroll through large hunks without triggering accidental canvas zooms.

### 2. Resizing Behavior & Visibility
- **Modified `app/main.js`**:
    - Updated resize logic to use `style.height` (fixed height) instead of `style.maxHeight`. This fixes the issue where resizing from the top-left would visually shift the bottom-right corner (because `maxHeight` didn't force the element to fill the space if content was smaller).
    - improved `minH` calculation to ensure that at least a "few lines" of each hunk remain visible. The new formula is `100 + hunkCount * 80` (pixels), providing enough space for headers and content.
    - Updated `savePosition` to persist the explicit height.

### 3. Header Cursor
- **Modified `app/styles/main.css`**: Explicitly set `cursor: default` on `.file-card-header`. This removes any "move" or special cursor, aligning with the user's request since the entire card body is draggable.

### 4. Card Content Layout
- **Modified `app/styles/main.css`**:
    - Set `.file-card-body` to `display: flex; flex: 1; min-height: 0; overflow-y: auto;`. This ensures that the body fills the card's fixed height and handles overflow with a scrollbar, preventing content from being clipped when the card is resized.
