/**
 * CanvasState — Reactive state container for the infinite canvas
 *
 * Tracks zoom level, pan offset, and provides world↔screen
 * coordinate conversion utilities.
 */

export interface CanvasStateSnapshot {
    zoom: number;
    offsetX: number;
    offsetY: number;
}

export interface ViewportRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

export class CanvasState {
    zoom = 1;
    offsetX = 0;
    offsetY = 0;

    private viewportEl: HTMLElement | null = null;
    private contentEl: HTMLElement | null = null;
    private listeners = new Set<() => void>();

    // ─── Zoom limits ─────────────────────────────────────
    readonly MIN_ZOOM = 0.05;
    readonly MAX_ZOOM = 5;

    constructor(viewport?: HTMLElement, content?: HTMLElement) {
        this.viewportEl = viewport ?? null;
        this.contentEl = content ?? null;
    }

    /** Bind to DOM elements after mount */
    bind(viewport: HTMLElement, content: HTMLElement) {
        this.viewportEl = viewport;
        this.contentEl = content;
        this.applyTransform();
    }

    /** Get a frozen snapshot of current state */
    snapshot(): CanvasStateSnapshot {
        return { zoom: this.zoom, offsetX: this.offsetX, offsetY: this.offsetY };
    }

    /** Subscribe to state changes */
    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private notify() {
        for (const fn of this.listeners) fn();
    }

    // ─── Transform ───────────────────────────────────────

    /** Apply current state to the content element's CSS transform */
    applyTransform() {
        if (!this.contentEl) return;
        this.contentEl.style.transform =
            `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`;
    }

    /** Set zoom + offset, clamping zoom to limits */
    set(zoom: number, offsetX: number, offsetY: number) {
        this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, zoom));
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.applyTransform();
        this.notify();
    }

    /** Pan by delta pixels */
    pan(dx: number, dy: number) {
        this.offsetX += dx;
        this.offsetY += dy;
        this.applyTransform();
        this.notify();
    }

    /** Zoom toward a screen point (e.g. cursor position) */
    zoomToward(screenX: number, screenY: number, factor: number) {
        const newZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * factor));
        if (newZoom === this.zoom) return;

        const rect = this.viewportEl?.getBoundingClientRect();
        const mouseX = screenX - (rect?.left ?? 0);
        const mouseY = screenY - (rect?.top ?? 0);

        // Convert screen point to world coordinates at current zoom
        const worldX = (mouseX - this.offsetX) / this.zoom;
        const worldY = (mouseY - this.offsetY) / this.zoom;

        // Update zoom and recalculate offset to keep world point under cursor
        this.zoom = newZoom;
        this.offsetX = mouseX - worldX * newZoom;
        this.offsetY = mouseY - worldY * newZoom;

        this.applyTransform();
        this.notify();
    }

    // ─── Coordinate conversion ───────────────────────────

    /** Screen pixel → world coordinate */
    screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
        const rect = this.viewportEl?.getBoundingClientRect();
        const localX = screenX - (rect?.left ?? 0);
        const localY = screenY - (rect?.top ?? 0);
        return {
            x: (localX - this.offsetX) / this.zoom,
            y: (localY - this.offsetY) / this.zoom,
        };
    }

    /** World coordinate → screen pixel */
    worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
        const rect = this.viewportEl?.getBoundingClientRect();
        return {
            x: worldX * this.zoom + this.offsetX + (rect?.left ?? 0),
            y: worldY * this.zoom + this.offsetY + (rect?.top ?? 0),
        };
    }

    /** Get the visible world-space rectangle (with optional margin in screen px) */
    getVisibleWorldRect(margin = 0): ViewportRect | null {
        if (!this.viewportEl) return null;
        const vpW = this.viewportEl.clientWidth;
        const vpH = this.viewportEl.clientHeight;

        const left = (-this.offsetX - margin) / this.zoom;
        const top = (-this.offsetY - margin) / this.zoom;
        const right = (vpW - this.offsetX + margin) / this.zoom;
        const bottom = (vpH - this.offsetY + margin) / this.zoom;

        return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    /** Fit a world-space bounding box into the viewport */
    fitRect(worldLeft: number, worldTop: number, worldRight: number, worldBottom: number, padding = 60) {
        if (!this.viewportEl) return;
        const vpW = this.viewportEl.clientWidth;
        const vpH = this.viewportEl.clientHeight;

        const w = worldRight - worldLeft + padding * 2;
        const h = worldBottom - worldTop + padding * 2;
        const zoom = Math.min(vpW / w, vpH / h, this.MAX_ZOOM);

        this.set(
            zoom,
            (vpW - w * zoom) / 2 - (worldLeft - padding) * zoom,
            (vpH - h * zoom) / 2 - (worldTop - padding) * zoom,
        );
    }
}
