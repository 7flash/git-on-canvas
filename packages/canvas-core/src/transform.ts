/**
 * gx-canvas-core — Transform Math
 * 
 * Pure functions for canvas coordinate transforms.
 * No DOM, no side effects — just math.
 */
import type { CanvasState, ViewportRect } from './types';

/** Convert screen coordinates to canvas (world) coordinates */
export function screenToWorld(state: CanvasState, screenX: number, screenY: number): { x: number; y: number } {
    return {
        x: (screenX - state.offsetX) / state.zoom,
        y: (screenY - state.offsetY) / state.zoom,
    };
}

/** Convert canvas (world) coordinates to screen coordinates */
export function worldToScreen(state: CanvasState, worldX: number, worldY: number): { x: number; y: number } {
    return {
        x: worldX * state.zoom + state.offsetX,
        y: worldY * state.zoom + state.offsetY,
    };
}

/** Get the visible world-space rectangle for the current viewport */
export function getViewportRect(state: CanvasState, viewportWidth: number, viewportHeight: number): ViewportRect {
    return {
        x: -state.offsetX / state.zoom,
        y: -state.offsetY / state.zoom,
        width: viewportWidth / state.zoom,
        height: viewportHeight / state.zoom,
        zoom: state.zoom,
    };
}

/** Compute new state after zooming centered on a point */
export function zoomAtPoint(
    state: CanvasState,
    newZoom: number,
    centerX: number,
    centerY: number,
    zoomMin: number,
    zoomMax: number,
): CanvasState {
    const clampedZoom = Math.max(zoomMin, Math.min(zoomMax, newZoom));
    const worldBefore = screenToWorld(state, centerX, centerY);
    const offsetX = centerX - worldBefore.x * clampedZoom;
    const offsetY = centerY - worldBefore.y * clampedZoom;
    return { offsetX, offsetY, zoom: clampedZoom };
}

/** Compute state that fits all containers in the viewport with padding */
export function fitBounds(
    containers: { x: number; y: number; width: number; height: number }[],
    viewportWidth: number,
    viewportHeight: number,
    padding: number = 50,
    zoomMin: number = 0.05,
    zoomMax: number = 3,
): CanvasState {
    if (containers.length === 0) return { offsetX: 0, offsetY: 0, zoom: 1 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of containers) {
        if (c.x < minX) minX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.x + c.width > maxX) maxX = c.x + c.width;
        if (c.y + c.height > maxY) maxY = c.y + c.height;
    }

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return { offsetX: 0, offsetY: 0, zoom: 1 };

    const zoom = Math.max(zoomMin, Math.min(zoomMax,
        Math.min(
            (viewportWidth - padding * 2) / contentW,
            (viewportHeight - padding * 2) / contentH,
        )
    ));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
        offsetX: viewportWidth / 2 - centerX * zoom,
        offsetY: viewportHeight / 2 - centerY * zoom,
        zoom,
    };
}

/** Apply CSS transform to a canvas element */
export function applyTransform(el: HTMLElement, state: CanvasState): void {
    el.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.zoom})`;
}
