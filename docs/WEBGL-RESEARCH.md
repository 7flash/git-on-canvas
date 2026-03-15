# Canvas WebGL Acceleration Research

## Current Architecture

### Rendering Stack

1. **galaxydraw** (`packages/galaxydraw/`) - 2D Canvas DOM transformations
   - Pan/zoom via CSS `transform: translate() scale()`
   - Viewport culling for card visibility
   - Card drag/resize/minimap

2. **CanvasTextRenderer** (`app/lib/canvas-text.ts` - 844 lines)
   - HTML5 Canvas 2D API for code text rendering
   - Custom scroll handling
   - Diff highlighting (add/delete lines)
   - Line numbers, change gutter

3. **DOM Cards** (`app/lib/cards.tsx`)
   - File cards as DOM elements
   - CodeMirror for full editor modal
   - Canvas 2D for inline previews

## Performance Bottlenecks

### Current Limits

- **~1000-2000 files** before thermal throttling on laptops
- **Canvas 2D** is CPU-bound, single-threaded
- **DOM overhead** for card elements (even with culling)
- **Text rendering** recalculates every frame during pan/zoom

### Target: 10,000+ Files

Need **GPU-accelerated** rendering to handle:

- Large monorepos (deno, react, next.js)
- Multi-repo workspaces
- Real-time collaboration cursors

## WebGL Options

### Option 1: Pixi.js

**Pros:**

- Mature 2D WebGL renderer (11 years old)
- Automatic batching, sprite optimization
- Text rendering via BitmapFont or SDF
- Easy migration from Canvas 2D
- 45KB minified, zero dependencies

**Cons:**

- Text rendering requires pre-generated fonts
- Less control over raw WebGL

**Migration Path:**

```ts
// Current
const ctx = canvas.getContext("2d");
ctx.fillText(line, x, y);

// Pixi.js
const text = new PIXI.Text(line, { fontFamily: "monospace", fontSize: 12 });
app.stage.addChild(text);
```

### Option 2: Raw WebGL + wgpu

**Pros:**

- Maximum control
- Custom shaders for text/SDF
- Future-proof (WebGPU)

**Cons:**

- 10x more code
- Need to manage buffers, shaders, textures
- Text rendering is complex (SDF fonts)

### Option 3: Hybrid Approach ⭐ RECOMMENDED

Keep galaxydraw DOM structure for:

- Card containers
- Drag/resize handles
- Minimap DOM overlay

Replace Canvas 2D with Pixi.js for:

- Code text rendering
- Connection lines (Bezier curves)
- Diff markers
- Selection highlights

## Implementation Plan

### Phase 1: Pixi.js Integration (2-3 days)

1. Add `pixi.js` dependency to `packages/galaxydraw/package.json`
2. Create `WebGLTextRenderer` class (drop-in replacement for `CanvasTextRenderer`)
3. Implement bitmap font generation for monospace fonts
4. Test on small repos (100-500 files)

### Phase 2: Connection Lines (1-2 days)

1. Migrate `app/lib/connections.ts` to Pixi.js Graphics
2. GPU-accelerated Bezier curves
3. Zoom-aware LOD already implemented, just port logic

### Phase 3: Viewport Culling Optimization (1 day)

1. Pixi.js has built-in culling (`sprite.visible = false`)
2. Integrate with existing `ViewportCuller`
3. Lazy texture loading for deferred cards

### Phase 4: Performance Testing

1. Benchmark on large repos (deno, react)
2. Measure FPS during pan/zoom
3. Thermal throttling tests on laptops

## Pixi.js Text Rendering

### BitmapFont Approach

```ts
import { BitmapFont, BitmapText } from "pixi.js";

// Generate font once
BitmapFont.install({
  name: "monospace",
  style: {
    fontFamily: "JetBrains Mono",
    fontSize: 12,
    fill: 0xffffff,
  },
  chars: BitmapFont.ASCII + BitmapFont.EXTENDED,
});

// Per line
const lineText = new BitmapText(lineContent, { fontName: "monospace" });
```

**Pros:** Fast rendering, GPU batched
**Cons:** Fixed font size, need multiple sizes for zoom levels

### SDF (Signed Distance Field) Approach

```ts
// Pre-generate SDF texture for each character
// Scale infinitely without quality loss
const sdfText = new SDFText(lineContent);
```

**Pros:** Infinite scaling, crisp at any zoom
**Cons:** More complex setup, larger initial load

## Code Changes Required

### Files to Modify

1. `app/lib/canvas-text.ts` → `app/lib/webgl-text.ts` (new)
2. `app/lib/cards.tsx` - swap renderer instantiation
3. `app/lib/connections.ts` - port to Pixi Graphics
4. `packages/galaxydraw/src/core/engine.ts` - optional Pixi integration

### API Compatibility

Maintain same interface so existing code works:

```ts
// Both implement same interface
interface TextRenderer {
  scrollTo(line: number): void;
  setZoom(zoom: number): void;
  highlightHunk(hunkIndex: number): void;
  destroy(): void;
}
```

## Performance Expectations

### Current (Canvas 2D)

- 500 files: 60 FPS
- 1000 files: 30-40 FPS
- 2000+ files: thermal throttling

### Target (WebGL)

- 5000 files: 60 FPS
- 10,000 files: 30-40 FPS
- 20,000+ files: graceful degradation

## Next Steps

1. [ ] Install Pixi.js in galaxydraw package
2. [ ] Create `WebGLTextRenderer` prototype
3. [ ] Test bitmap font generation
4. [ ] Benchmark on 100-file repo
5. [ ] Iterate and optimize

## References

- [Pixi.js Documentation](https://pixijs.io/guides/)
- [Pixi.js Text Rendering](https://pixijs.io/guides/basics/text.html)
- [Signed Distance Field Fonts](https://github.com/soimy/msdf-text-pixijs)
- [WebGPU for 2D](https://webgpu.github.io/webgpu-samples/)
