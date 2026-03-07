// @ts-nocheck
/**
 * GalaxyDraw Bridge — Phase 2+3+4: State Engine + Event Delegation + Card Manager
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
 * - CardManager (Phase 4) wraps card creation with plugins
 * 
 * What stays the same:
 * - Server-rendered DOM structure
 * - XState actor for app state (source-of-truth for persistence)
 * - Card rendering in cards.tsx (wrapped by FileCardPlugin)
 */

import { CanvasState } from '../../packages/galaxydraw/src/core/state';
import { CardManager } from '../../packages/galaxydraw/src/core/cards';
import { EventBus } from '../../packages/galaxydraw/src/core/events';
import { createFileCardPlugin, createDiffCardPlugin } from './file-card-plugin';
import type { CanvasContext } from './context';

/** 
 * Shared galaxydraw state instance.
 * Replaces manual `ctx.canvas.style.transform = ...` calls.
 */
let _gdState: CanvasState | null = null;
let _cardManager: CardManager | null = null;
let _eventBus: EventBus | null = null;

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

/**
 * Phase 3: Pan by pixel delta, delegating to galaxydraw's engine.
 * Syncs back to XState for persistence.
 */
export function panByDelta(
    ctx: CanvasContext,
    dx: number,
    dy: number,
): void {
    const gd = _gdState;

    if (gd) {
        gd.pan(dx, dy);
        ctx.actor.send({ type: 'SET_OFFSET', x: gd.offsetX, y: gd.offsetY });
        return;
    }

    // Fallback
    const state = ctx.snap().context;
    ctx.actor.send({ type: 'SET_OFFSET', x: state.offsetX + dx, y: state.offsetY + dy });
}

/**
 * Phase 3: Convert screen coordinates to world coordinates.
 * Delegates to CanvasState.screenToWorld() when available.
 */
export function screenToWorld(
    ctx: CanvasContext,
    screenX: number,
    screenY: number,
): { x: number; y: number } {
    const gd = _gdState;

    if (gd) {
        return gd.screenToWorld(screenX, screenY);
    }

    // Fallback
    const state = ctx.snap().context;
    const rect = ctx.canvasViewport?.getBoundingClientRect();
    return {
        x: (screenX - (rect?.left ?? 0) - state.offsetX) / state.zoom,
        y: (screenY - (rect?.top ?? 0) - state.offsetY) / state.zoom,
    };
}

/**
 * Phase 3: Center the viewport on a world coordinate.
 * Delegates to CanvasState.panTo() when available.
 */
export function panToWorld(
    ctx: CanvasContext,
    worldX: number,
    worldY: number,
): void {
    const gd = _gdState;

    if (gd) {
        gd.panTo(worldX, worldY);
        ctx.actor.send({ type: 'SET_OFFSET', x: gd.offsetX, y: gd.offsetY });
        return;
    }

    // Fallback
    const state = ctx.snap().context;
    const vp = ctx.canvasViewport;
    if (vp) {
        const vpW = vp.clientWidth;
        const vpH = vp.clientHeight;
        const newOffsetX = vpW / 2 - worldX * state.zoom;
        const newOffsetY = vpH / 2 - worldY * state.zoom;
        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
    }
}

// ─── Phase 4: Card Manager ──────────────────────────────

/**
 * Initialize the CardManager with file card plugins.
 * Call after initGalaxyDrawState() when ctx.canvas is available.
 * 
 * The CardManager handles:
 * - Card creation via plugins (FileCardPlugin, DiffCardPlugin)
 * - Drag, resize, z-order management
 * - Selection (single, multi)
 * - Deferred rendering (virtualization)
 */
export function initCardManager(ctx: CanvasContext): CardManager | null {
    if (!_gdState || !ctx.canvas) {
        console.warn('[galaxydraw-bridge] Cannot init CardManager: state or canvas not ready');
        return null;
    }

    _eventBus = new EventBus();
    _cardManager = new CardManager(_gdState, _eventBus, ctx.canvas, {
        defaultWidth: 580,
        defaultHeight: 700,
        minWidth: 280,
        minHeight: 200,
        gridSize: 0,
        cornerSize: 40,
    });

    // Register plugins
    _cardManager.registerPlugin(createFileCardPlugin());
    _cardManager.registerPlugin(createDiffCardPlugin());

    // Sync card events back to XState for persistence
    _eventBus.on('card:move', (ev) => {
        const { id, x, y } = ev;
        ctx.actor.send({ type: 'SAVE_POSITION', path: id, x, y });
    });

    _eventBus.on('card:resize', (ev) => {
        const { id, width, height } = ev;
        ctx.actor.send({ type: 'RESIZE_CARD', path: id, width, height });
    });

    console.log('[galaxydraw-bridge] CardManager initialized with file + diff plugins');
    return _cardManager;
}

/**
 * Get the shared CardManager instance.
 */
export function getCardManager(): CardManager | null {
    return _cardManager;
}

/**
 * Get the shared EventBus instance.
 */
export function getEventBus(): EventBus | null {
    return _eventBus;
}
