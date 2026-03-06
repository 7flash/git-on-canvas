/**
 * GalaxyDraw — Main engine class
 *
 * Creates an infinite canvas with pan/zoom/drag support.
 * Supports two control modes:
 * - Simple: click-drag = pan canvas (WARMAPS style)
 * - Advanced: click-drag = select, Space+drag = pan (GitMaps style)
 *
 * Usage:
 *   const gd = new GalaxyDraw(containerEl, { mode: 'simple' });
 *   gd.cards.registerPlugin(myPlugin);
 *   gd.cards.create('widget', { id: 'w1', x: 100, y: 100 });
 */

import { CanvasState } from './state';
import { CardManager } from './cards';
import type { CardOptions, CardPlugin } from './cards';
import { ViewportCuller } from './viewport';
import { EventBus } from './events';

export type ControlMode = 'simple' | 'advanced';

export interface GalaxyDrawOptions {
    /** Control scheme: 'simple' = drag to pan, 'advanced' = space+drag to pan */
    mode?: ControlMode;
    /** Card defaults */
    cards?: CardOptions;
    /** Viewport culling margin in px */
    cullMargin?: number;
    /** Enable minimap */
    minimap?: boolean;
    /** Custom CSS class added to the root */
    className?: string;
}

export class GalaxyDraw {
    readonly state: CanvasState;
    readonly cards: CardManager;
    readonly culler: ViewportCuller;
    readonly bus: EventBus;

    private mode: ControlMode;
    private viewport: HTMLElement;
    private canvas: HTMLElement;
    private spaceHeld = false;
    private isDragging = false;
    private dragStartX = 0;
    private dragStartY = 0;
    private cleanupFns: (() => void)[] = [];

    constructor(container: HTMLElement, options?: GalaxyDrawOptions) {
        this.mode = options?.mode ?? 'simple';
        this.bus = new EventBus();

        // ── Create DOM structure ──
        this.viewport = document.createElement('div');
        this.viewport.className = `gd-viewport ${options?.className ?? ''}`.trim();
        this.viewport.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;';

        this.canvas = document.createElement('div');
        this.canvas.className = 'gd-canvas';
        this.canvas.style.cssText = 'position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;';

        this.viewport.appendChild(this.canvas);
        container.appendChild(this.viewport);

        // ── Init subsystems ──
        this.state = new CanvasState();
        this.state.bind(this.viewport, this.canvas);

        this.cards = new CardManager(this.state, this.bus, this.canvas, options?.cards);
        this.culler = new ViewportCuller(this.state, this.cards, this.bus);
        if (options?.cullMargin) this.culler.margin = options.cullMargin;

        // ── Wire up interactions ──
        this.setupWheel();
        this.setupMouse();
        this.setupKeyboard();

        // ── Cull on state change ──
        const unsub = this.state.subscribe(() => this.culler.schedule());
        this.cleanupFns.push(unsub);
    }

    // ─── Public API ──────────────────────────────────────

    /** Switch control mode at runtime */
    setMode(mode: ControlMode) {
        this.mode = mode;
        this.bus.emit('mode:change', { mode });
    }

    getMode(): ControlMode {
        return this.mode;
    }

    /** Register a card plugin */
    registerPlugin(plugin: CardPlugin) {
        this.cards.registerPlugin(plugin);
    }

    /** Fit all cards into view */
    fitAll(padding = 60) {
        this.culler.uncullAll();
        if (this.cards.cards.size === 0) return;

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

        this.state.fitRect(minX, minY, maxX, maxY, padding);
    }

    /** Get the viewport DOM element (for appending overlays, minimap, etc.) */
    getViewport(): HTMLElement {
        return this.viewport;
    }

    /** Get the canvas DOM element */
    getCanvas(): HTMLElement {
        return this.canvas;
    }

    /** Destroy the engine, remove all listeners and DOM */
    destroy() {
        this.cleanupFns.forEach(fn => fn());
        this.cleanupFns = [];
        this.cards.clear();
        this.bus.clear();
        this.viewport.remove();
    }

    // ─── Wheel zoom ──────────────────────────────────────

    private setupWheel() {
        this.viewport.addEventListener('wheel', (e) => {
            const target = e.target as HTMLElement;

            // Let card plugins handle their own scroll (maps, feeds, etc.)
            if (this.cards.consumesWheel(target)) return;

            // Let scrollable card bodies scroll naturally
            const scrollBody = target.closest('.gd-card-body') as HTMLElement | null;
            if (scrollBody && scrollBody.scrollHeight > scrollBody.clientHeight) {
                const atTop = scrollBody.scrollTop <= 0 && e.deltaY < 0;
                const atBottom = scrollBody.scrollTop + scrollBody.clientHeight >= scrollBody.scrollHeight - 1 && e.deltaY > 0;
                if (!atTop && !atBottom) return;
            }

            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
            this.state.zoomToward(e.clientX, e.clientY, factor);
        }, { passive: false });
    }

    // ─── Mouse interactions ──────────────────────────────

    private setupMouse() {
        this.viewport.addEventListener('mousedown', (e) => {
            const target = e.target as HTMLElement;

            // Let card plugins handle their own mouse (maps, interactive widgets)
            if (this.cards.consumesMouse(target)) return;

            // Card header drag is handled by CardManager
            if (target.closest('.gd-card-header') || target.closest('.gd-resize-handle')) return;

            // Click on card = bring to front + select
            const card = target.closest('.gd-card') as HTMLElement | null;
            if (card && e.button === 0) {
                const id = card.dataset.cardId;
                if (id) {
                    this.cards.bringToFront(card);
                    this.cards.select(id, e.shiftKey);
                }
                // In advanced mode, clicking a card body doesn't pan
                if (this.mode === 'advanced') return;
            }

            // ── Pan logic ──
            const shouldPan =
                e.button === 1 || // middle click always pans
                (this.mode === 'simple' && e.button === 0 && !card) || // simple: left click on empty canvas
                (this.mode === 'advanced' && this.spaceHeld); // advanced: space held

            if (shouldPan) {
                this.isDragging = true;
                this.dragStartX = e.clientX - this.state.offsetX;
                this.dragStartY = e.clientY - this.state.offsetY;
                this.viewport.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.state.set(
                    this.state.zoom,
                    e.clientX - this.dragStartX,
                    e.clientY - this.dragStartY,
                );
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.viewport.style.cursor = '';
            }
        });
    }

    // ─── Keyboard ────────────────────────────────────────

    private setupKeyboard() {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat) {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                e.preventDefault();
                this.spaceHeld = true;
                this.viewport.classList.add('gd-space-pan');
            }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                this.spaceHeld = false;
                this.viewport.classList.remove('gd-space-pan');
                if (this.isDragging) {
                    this.isDragging = false;
                    this.viewport.style.cursor = '';
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        this.cleanupFns.push(() => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        });
    }
}
