/**
 * Minimap — Small overview of the entire canvas
 *
 * Renders a proportional view of all card positions as colored
 * rectangles. Click/drag on the minimap to navigate.
 */

import type { CanvasState } from './state';
import type { CardManager } from './cards';

export class Minimap {
    private el: HTMLElement;
    private mapCanvas: HTMLCanvasElement;
    private ctx2d: CanvasRenderingContext2D | null;
    private rafPending = false;

    /** Minimap dimensions */
    width = 180;
    height = 120;

    constructor(
        private state: CanvasState,
        private cards: CardManager,
        container: HTMLElement,
    ) {
        this.el = document.createElement('div');
        this.el.className = 'gd-minimap';
        this.el.style.cssText = `
            position: absolute;
            bottom: 12px;
            right: 12px;
            width: ${this.width}px;
            height: ${this.height}px;
            border-radius: 8px;
            overflow: hidden;
            backdrop-filter: blur(12px);
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
            cursor: pointer;
            z-index: 999;
        `;

        this.mapCanvas = document.createElement('canvas');
        this.mapCanvas.width = this.width;
        this.mapCanvas.height = this.height;
        this.el.appendChild(this.mapCanvas);
        container.appendChild(this.el);

        this.ctx2d = this.mapCanvas.getContext('2d');

        // Click to navigate
        this.el.addEventListener('mousedown', (e) => this.handleClick(e));

        // Auto-rebuild on state change
        this.state.subscribe(() => this.scheduleRebuild());
    }

    /** Schedule a redraw */
    scheduleRebuild() {
        if (this.rafPending) return;
        this.rafPending = true;
        requestAnimationFrame(() => {
            this.rafPending = false;
            this.rebuild();
        });
    }

    /** Force immediate redraw */
    rebuild() {
        const ctx = this.ctx2d;
        if (!ctx) return;
        ctx.clearRect(0, 0, this.width, this.height);

        // Compute world bounding box of all cards
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [, card] of this.cards.cards) {
            const x = parseFloat(card.style.left) || 0;
            const y = parseFloat(card.style.top) || 0;
            const w = card.offsetWidth || 400;
            const h = card.offsetHeight || 300;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        }

        // Include deferred cards in bounding box
        for (const [, data] of this.cards.deferred) {
            minX = Math.min(minX, data.x);
            minY = Math.min(minY, data.y);
            maxX = Math.max(maxX, data.x + data.width);
            maxY = Math.max(maxY, data.y + data.height);
        }

        if (minX === Infinity) return; // no cards

        const pad = 50;
        const worldW = maxX - minX + pad * 2;
        const worldH = maxY - minY + pad * 2;
        const scale = Math.min(this.width / worldW, this.height / worldH);

        const ox = (this.width - worldW * scale) / 2;
        const oy = (this.height - worldH * scale) / 2;

        // Draw card dots
        ctx.fillStyle = 'rgba(147, 130, 255, 0.6)';
        for (const [, card] of this.cards.cards) {
            const x = (parseFloat(card.style.left) || 0) - minX + pad;
            const y = (parseFloat(card.style.top) || 0) - minY + pad;
            const w = card.offsetWidth || 400;
            const h = card.offsetHeight || 300;
            ctx.fillRect(ox + x * scale, oy + y * scale, Math.max(2, w * scale), Math.max(2, h * scale));
        }

        // Draw deferred card dots (dimmer)
        ctx.fillStyle = 'rgba(147, 130, 255, 0.2)';
        for (const [, data] of this.cards.deferred) {
            const x = data.x - minX + pad;
            const y = data.y - minY + pad;
            ctx.fillRect(ox + x * scale, oy + y * scale, Math.max(2, data.width * scale), Math.max(2, data.height * scale));
        }

        // Draw viewport rect
        const vp = this.state.getVisibleWorldRect();
        if (vp) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 1.5;
            const rx = ox + (vp.left - minX + pad) * scale;
            const ry = oy + (vp.top - minY + pad) * scale;
            const rw = vp.width * scale;
            const rh = vp.height * scale;
            ctx.strokeRect(rx, ry, rw, rh);
        }
    }

    private handleClick(e: MouseEvent) {
        // TODO: Convert minimap click coords back to world coords and pan there
        e.stopPropagation();
    }

    /** Show/hide the minimap */
    setVisible(visible: boolean) {
        this.el.style.display = visible ? '' : 'none';
    }

    destroy() {
        this.el.remove();
    }
}
