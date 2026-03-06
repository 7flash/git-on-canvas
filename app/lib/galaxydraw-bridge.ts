// @ts-nocheck
/**
 * GalaxyDraw Bridge — Phase 1: State Engine Only
 * 
 * Instead of replacing DOM, we only replace the transform/state logic.
 * The server-rendered DOM (#canvasViewport, #canvasContent) stays intact.
 * 
 * What changes:
 * - CanvasState from galaxydraw manages zoom/pan/transform
 * - updateCanvasTransform() delegates to CanvasState.applyTransform()
 * - Coordinate conversion uses galaxydraw's utilities
 * 
 * What stays the same:
 * - Server-rendered DOM structure
 * - XState actor for app state
 * - All existing event handlers in events.tsx
 * - All card rendering in cards.tsx
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
