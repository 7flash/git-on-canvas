// @ts-nocheck
/**
 * GalaxyDraw Bridge — Phase 2+3: State Engine + Event Delegation
 * 
 * Instead of replacing DOM, we only replace the transform/state logic
 * and gradually delegate event handlers to the galaxydraw engine.
 * The server-rendered DOM (#canvasViewport, #canvasContent) stays intact.
 * 
 * What changes:
 * - CanvasState from galaxydraw manages zoom/pan/transform
 * - updateCanvasTransform() delegates to CanvasState.applyTransform()
 * - Coordinate conversion uses galaxydraw's utilities
 * - zoomTowardScreen() replaces manual zoom-toward-cursor math
 * 
 * What stays the same:
 * - Server-rendered DOM structure
 * - XState actor for app state (source-of-truth for persistence)
 * - Card rendering in cards.tsx
 */

import { CanvasState } from '../../packages/galaxydraw/src/core/state';
import type { CanvasContext } from './context';

/** 
 * Shared galaxydraw state instance.
 * Replaces manual `ctx.canvas.style.transform = ...` calls.
 */
let _gdState: CanvasState | null = null;

/**
 * Initialize the galaxydraw state engine and bind to existing DOM.
 * Call this after ctx.canvas and ctx.canvasViewport are set.
 */
export function initGalaxyDrawState(ctx: CanvasContext): CanvasState {
    _gdState = new CanvasState();

    if (ctx.canvasViewport && ctx.canvas) {
        _gdState.bind(ctx.canvasViewport, ctx.canvas);
    }

    // Sync initial state from XState
    const state = ctx.snap().context;
    if (state.zoom) _gdState.zoom = state.zoom;
    if (state.offsetX) _gdState.offsetX = state.offsetX;
    if (state.offsetY) _gdState.offsetY = state.offsetY;
    _gdState.applyTransform();

    return _gdState;
}

/**
 * Get the shared CanvasState instance.
 */
export function getGalaxyDrawState(): CanvasState | null {
    return _gdState;
}

/**
 * Phase 3: Zoom toward a screen point using galaxydraw's engine,
 * then sync the computed state back to XState for persistence.
 * 
 * Replaces the manual zoom math previously duplicated in events.tsx.
 * Falls back to manual calculation if galaxydraw isn't initialized.
 * 
 * @returns The new zoom/offset values (for callers that need them)
 */
export function zoomTowardScreen(
    ctx: CanvasContext,
    screenX: number,
    screenY: number,
    factor: number,
): { zoom: number; offsetX: number; offsetY: number } {
    const gd = _gdState;

    if (gd) {
        // Delegate to galaxydraw engine
        gd.zoomToward(screenX, screenY, factor);
        // Sync back to XState for persistence
        ctx.actor.send({ type: 'SET_ZOOM', zoom: gd.zoom });
        ctx.actor.send({ type: 'SET_OFFSET', x: gd.offsetX, y: gd.offsetY });
        return { zoom: gd.zoom, offsetX: gd.offsetX, offsetY: gd.offsetY };
    }

    // Fallback: manual math (pre-bridge init)
    const state = ctx.snap().context;
    const rect = ctx.canvasViewport?.getBoundingClientRect();
    const mouseX = screenX - (rect?.left ?? 0);
    const mouseY = screenY - (rect?.top ?? 0);
    const newZoom = Math.min(3, Math.max(0.1, state.zoom * factor));
    const scale = newZoom / state.zoom;
    const newOffsetX = mouseX - (mouseX - state.offsetX) * scale;
    const newOffsetY = mouseY - (mouseY - state.offsetY) * scale;
    ctx.actor.send({ type: 'SET_ZOOM', zoom: newZoom });
    ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
    return { zoom: newZoom, offsetX: newOffsetX, offsetY: newOffsetY };
}
