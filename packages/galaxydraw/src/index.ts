/**
 * galaxydraw — Infinite canvas framework
 *
 * Core engine for spatial applications. Provides:
 * - Infinite pan/zoom canvas with GPU-accelerated transforms
 * - Virtualized card rendering (only DOM for visible cards)
 * - Drag, resize, z-order, collapse for cards
 * - Minimap with click-to-navigate
 * - Layout persistence (localStorage + optional server sync)
 * - Dual control modes (Simple: drag=pan / Advanced: space+drag=pan)
 * - Keyboard shortcuts system
 * - Plugin architecture for custom card types
 */

// ─── Core ────────────────────────────────────────────────
export { GalaxyDraw } from "./core/engine";
export type { GalaxyDrawOptions, ControlMode } from "./core/engine";

// ─── WebGL Renderer ──────────────────────────────────────
export { WebGLRenderer } from "./core/webgl-renderer";
export type { WebGLRendererOptions, WebGLCard } from "./core/webgl-renderer";

// ─── Canvas State ────────────────────────────────────────
export { CanvasState } from "./core/state";
export type { CanvasStateSnapshot, ViewportRect } from "./core/state";

// ─── Cards ───────────────────────────────────────────────
export { CardManager } from "./core/cards";
export type { CardOptions, CardData, CardPlugin } from "./core/cards";

// ─── Viewport & Virtualization ───────────────────────────
export { ViewportCuller } from "./core/viewport";
export type { CullResult } from "./core/viewport";

// ─── Layout ──────────────────────────────────────────────
export { LayoutManager } from "./core/layout";
export type { LayoutData, LayoutProvider } from "./core/layout";

// ─── Minimap ─────────────────────────────────────────────
export { Minimap } from "./core/minimap";

// ─── Events ──────────────────────────────────────────────
export { EventBus } from "./core/events";
export type { GalaxyDrawEvent, EventHandler } from "./core/events";
