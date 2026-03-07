# galaxydraw

[![npm](https://img.shields.io/npm/v/galaxydraw.svg?style=flat-square)](https://www.npmjs.com/package/galaxydraw)

Infinite canvas framework for spatial applications. Zero dependencies, ~31KB.

**Before** — 760 lines of custom pan/zoom/drag/touch/minimap/resize code per project:

```ts
let state = { zoom: 1, offsetX: 0, offsetY: 0 };
viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const newZoom = Math.max(0.15, Math.min(3, state.zoom * zoomFactor));
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const worldX = (mouseX - state.offsetX) / state.zoom;
    const worldY = (mouseY - state.offsetY) / state.zoom;
    state.zoom = newZoom;
    state.offsetX = mouseX - worldX * newZoom;
    state.offsetY = mouseY - worldY * newZoom;
    content.style.transform = `translate(${state.offsetX}px,${state.offsetY}px) scale(${state.zoom})`;
});
// + 700 more lines for mouse pan, touch, drag, resize, minimap, z-order...
```

**After** — galaxydraw does the same in 3 lines:

```ts
import { GalaxyDraw } from 'galaxydraw';

const gd = new GalaxyDraw(document.getElementById('app'), { mode: 'simple' });
```

Pan, zoom, touch, keyboard shortcuts — all handled.

## Installation

```sh
bun add galaxydraw
# or: npm install galaxydraw
```

For local development across repos, use a `file:` dependency:

```json
"galaxydraw": "file:../galaxy-canvas/packages/galaxydraw"
```

## ✨ What You Get

Every `new GalaxyDraw()` automatically:

- 🖱️ **Mouse pan/zoom** → wheel zoom toward cursor, click-drag pan
- 📱 **Touch support** → single-finger pan, pinch-to-zoom
- ⌨️ **Keyboard** → Space+drag pan (advanced mode), input passthrough
- 🃏 **Card system** → drag, resize, z-order, selection via plugins
- 🔍 **Viewport culling** → only visible cards stay in DOM
- 🗺️ **Minimap** → optional overview with click navigation
- 📐 **Layout persistence** → save/restore positions (localStorage or custom)
- 🎛️ **Dual control modes** → Simple (WARMAPS) or Advanced (GitMaps)
- 🔌 **Plugin architecture** → custom card types with event passthrough

## Control Modes

| Mode | Left-click on canvas | Left-click on card | Space+drag |
|------|---------------------|--------------------|------------|
| `simple` | Pan | — | Pan |
| `advanced` | — | Select | Pan |

```ts
// Switch at runtime
gd.setMode('advanced');
```

## Card Plugins

Cards are rendered by plugins. Each plugin handles one card type:

```ts
import { GalaxyDraw } from 'galaxydraw';
import type { CardPlugin, CardData } from 'galaxydraw';

const widgetPlugin: CardPlugin = {
    type: 'widget',

    render(data: CardData): HTMLElement {
        const el = document.createElement('div');
        el.innerHTML = `
            <div class="gd-card-header">${data.meta?.title || 'Widget'}</div>
            <div class="gd-card-body">Content here</div>
        `;
        return el;
    },

    // Optional: claim mouse/wheel events for interactive content
    consumesWheel(target) {
        return !!target.closest('.maplibregl-map');
    },
    consumesMouse(target) {
        return !!target.closest('.maplibregl-map');
    },

    onResize(el, w, h) { /* handle resize */ },
    onDestroy(el) { /* cleanup */ },
};

const gd = new GalaxyDraw(containerEl, { mode: 'simple' });
gd.registerPlugin(widgetPlugin);

// Create cards
gd.cards.create('widget', { id: 'w1', x: 100, y: 100, meta: { title: 'Map' } });
gd.cards.create('widget', { id: 'w2', x: 500, y: 100, meta: { title: 'Feed' } });

// Defer off-screen cards (lazy-created when scrolled into view)
gd.cards.defer('widget', { id: 'w3', x: 3000, y: 3000, meta: { title: 'Far Away' } });
```

## Event Bus

Subscribe to card and engine events:

```ts
gd.bus.on('card:move', ({ id, x, y }) => savePosition(id, x, y));
gd.bus.on('card:resize', ({ id, w, h }) => saveSize(id, w, h));
gd.bus.on('card:select', ({ id, selected }) => updateUI(id));
gd.bus.on('mode:change', ({ mode }) => updateToolbar(mode));
```

## Canvas State

Direct access to pan/zoom state:

```ts
// Read
const { zoom, offsetX, offsetY } = gd.state.getSnapshot();

// Write
gd.state.set(1.5, -200, -100);   // zoom, offsetX, offsetY
gd.state.zoomToward(400, 300, 1.2); // zoom toward screen point
gd.state.pan(50, 0);              // delta pan

// Subscribe to changes
const unsub = gd.state.subscribe(() => {
    console.log('State changed:', gd.state.zoom);
});

// Coordinate conversion
const worldPt = gd.state.screenToWorld(e.clientX, e.clientY);

// Fit all content into view
gd.fitAll(60); // 60px padding
```

## Architecture

```
src/
├── index.ts           # Package entry — re-exports everything
└── core/
    ├── engine.ts      # GalaxyDraw class (253 lines)
    ├── state.ts       # CanvasState — zoom/offset/transform
    ├── cards.ts       # CardManager — create/defer/drag/resize/z-order
    ├── viewport.ts    # ViewportCuller — show/hide based on visibility
    ├── events.ts      # EventBus — typed pub/sub
    ├── layout.ts      # LayoutManager — save/restore positions
    └── minimap.ts     # Minimap — overview with click navigation
```

Total: ~700 lines of engine code. No dependencies.

## Used By

- **[GitMaps](https://github.com/7flash/git-on-canvas)** — Repository visualization on an infinite canvas. Uses `advanced` mode with FileCardPlugin + DiffCardPlugin.
- **[WARMAPS](https://github.com/7flash/starwar)** — Real-time geopolitical intelligence dashboard. Uses `simple` mode with WarmapsContainerPlugin for MapLibre passthrough.

## License

MIT
