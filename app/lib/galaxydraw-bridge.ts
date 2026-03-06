// @ts-nocheck
/**
 * GalaxyDraw Bridge — Connects galaxydraw engine to existing GitMaps modules.
 * 
 * This bridge lets us migrate incrementally:
 * 1. page.client.tsx creates GalaxyDraw instead of raw DOM setup
 * 2. Bridge populates CanvasContext from GalaxyDraw's internal state
 * 3. Existing modules (canvas.ts, events.tsx, cards.tsx) keep working
 * 4. Gradually, each module shifts to use GalaxyDraw's API directly
 * 
 * Phase 1 (this file): Pan/zoom/transform handled by galaxydraw
 * Phase 2: Card creation through galaxydraw CardManager
 * Phase 3: Remove CanvasContext entirely
 */

import { GalaxyDraw } from 'galaxydraw';
import type { ControlMode } from 'galaxydraw';
import type { CanvasContext } from './context';

/**
 * Create a GalaxyDraw instance and wire it into the existing CanvasContext.
 * 
 * After calling this, `ctx.canvas` and `ctx.canvasViewport` point to
 * galaxydraw's internal DOM elements, so existing code keeps working.
 */
export function initGalaxyDraw(
    container: HTMLElement,
    ctx: CanvasContext,
    mode: ControlMode = 'advanced'
): GalaxyDraw {
    const gd = new GalaxyDraw(container, {
        mode,
        className: 'gitmaps-canvas',
    });

    // Wire galaxydraw DOM into the existing CanvasContext
    ctx.canvas = gd.getCanvas();
    ctx.canvasViewport = gd.getViewport();

    // Sync control mode
    ctx.controlMode = mode;

    // When galaxydraw updates state, sync it to the XState actor 
    // so existing modules that read ctx.snap().context get correct values
    gd.state.subscribe(() => {
        const snap = ctx.snap().context;
        // Only sync if values actually changed (avoid infinite loops)
        if (snap.zoom !== gd.state.zoom) {
            ctx.actor.send({ type: 'SET_ZOOM', zoom: gd.state.zoom });
        }
        if (snap.offsetX !== gd.state.offsetX || snap.offsetY !== gd.state.offsetY) {
            ctx.actor.send({ type: 'SET_OFFSET', x: gd.state.offsetX, y: gd.state.offsetY });
        }
    });

    return gd;
}

/**
 * Sync XState → GalaxyDraw. Call this when XState state changes
 * from sources other than galaxydraw (e.g. repo load, fit-all).
 */
export function syncStateToGalaxyDraw(ctx: CanvasContext, gd: GalaxyDraw) {
    const state = ctx.snap().context;
    gd.state.set(state.zoom, state.offsetX, state.offsetY);
}
