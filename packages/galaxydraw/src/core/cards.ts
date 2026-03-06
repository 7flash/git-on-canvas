/**
 * CardManager — Manages cards (containers/widgets) on the canvas
 *
 * Handles:
 * - Card creation with custom content (via plugins)
 * - Drag, resize, z-order
 * - Selection (single, multi, rect-select)
 * - Collapse/expand
 * - Virtualized deferred rendering
 */

import type { CanvasState, ViewportRect } from './state';
import type { EventBus } from './events';

// ─── Types ───────────────────────────────────────────────

export interface CardData {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    collapsed?: boolean;
    /** Arbitrary data attached by the consumer */
    meta?: Record<string, any>;
}

export interface CardOptions {
    /** Default card width */
    defaultWidth?: number;
    /** Default card height */
    defaultHeight?: number;
    /** Minimum card width when resizing */
    minWidth?: number;
    /** Minimum card height when resizing */
    minHeight?: number;
    /** Grid snap size (0 = no snap) */
    gridSize?: number;
    /** Corner hit area for resize handle */
    cornerSize?: number;
}

/**
 * CardPlugin — how consumers define custom card types.
 *
 * Example: GitMaps provides a FileCardPlugin that renders source code.
 *          WARMAPS provides a MapCardPlugin that renders MapLibre.
 */
export interface CardPlugin {
    /** Unique type identifier */
    type: string;
    /** Create the DOM element for this card */
    render(data: CardData): HTMLElement;
    /** Called when the card is resized */
    onResize?(card: HTMLElement, width: number, height: number): void;
    /** Called when the card is destroyed */
    onDestroy?(card: HTMLElement): void;
    /** Should wheel events be passed through? (e.g. maps, scrollable content) */
    consumesWheel?(target: HTMLElement): boolean;
    /** Should mouse events be passed through? (e.g. maps, interactive widgets) */
    consumesMouse?(target: HTMLElement): boolean;
}

const DEFAULT_OPTIONS: Required<CardOptions> = {
    defaultWidth: 400,
    defaultHeight: 300,
    minWidth: 200,
    minHeight: 150,
    gridSize: 0,
    cornerSize: 40,
};

// ─── CardManager ─────────────────────────────────────────

export class CardManager {
    /** Active DOM cards: id → element */
    readonly cards = new Map<string, HTMLElement>();
    /** Deferred cards (not yet in DOM): id → data */
    readonly deferred = new Map<string, CardData & { plugin?: string }>();
    /** Currently selected card IDs */
    readonly selected = new Set<string>();

    private topZ = 10;
    private plugins = new Map<string, CardPlugin>();
    private opts: Required<CardOptions>;

    constructor(
        private state: CanvasState,
        private bus: EventBus,
        private canvas: HTMLElement,
        options?: CardOptions,
    ) {
        this.opts = { ...DEFAULT_OPTIONS, ...options };
    }

    // ─── Plugin registration ─────────────────────────────

    registerPlugin(plugin: CardPlugin) {
        this.plugins.set(plugin.type, plugin);
    }

    // ─── Card lifecycle ──────────────────────────────────

    /** Create a card and add it to the canvas */
    create(type: string, data: Partial<CardData> & { id: string }): HTMLElement | null {
        const plugin = this.plugins.get(type);
        if (!plugin) {
            console.warn(`[galaxydraw] No plugin registered for card type "${type}"`);
            return null;
        }

        const full: CardData = {
            x: data.x ?? 0,
            y: data.y ?? 0,
            width: data.width ?? this.opts.defaultWidth,
            height: data.height ?? this.opts.defaultHeight,
            collapsed: data.collapsed ?? false,
            meta: data.meta ?? {},
            ...data,
        };

        const el = plugin.render(full);
        el.classList.add('gd-card');
        el.dataset.cardId = full.id;
        el.dataset.cardType = type;
        el.style.left = `${full.x}px`;
        el.style.top = `${full.y}px`;
        el.style.width = `${full.width}px`;
        if (!full.collapsed) {
            el.style.height = `${full.height}px`;
        }

        this.canvas.appendChild(el);
        this.cards.set(full.id, el);
        this.bringToFront(el);

        this.setupDrag(el);
        this.setupResize(el, type);

        this.bus.emit('card:create', { id: full.id, x: full.x, y: full.y });
        return el;
    }

    /** Remove a card from the canvas and clean up */
    remove(id: string) {
        const el = this.cards.get(id);
        if (!el) {
            this.deferred.delete(id);
            return;
        }

        const type = el.dataset.cardType;
        if (type) {
            this.plugins.get(type)?.onDestroy?.(el);
        }

        el.remove();
        this.cards.delete(id);
        this.selected.delete(id);
        this.bus.emit('card:remove', { id });
    }

    /** Defer a card (store data, don't create DOM until it enters viewport) */
    defer(type: string, data: CardData) {
        this.deferred.set(data.id, { ...data, plugin: type });
    }

    /** Materialize deferred cards that overlap the given world rect */
    materializeInRect(worldRect: ViewportRect): number {
        let count = 0;
        const toRemove: string[] = [];

        for (const [id, entry] of this.deferred) {
            const { x, y, width, height, plugin } = entry as any;
            const w = width || this.opts.defaultWidth;
            const h = height || this.opts.defaultHeight;

            if (
                x + w > worldRect.left &&
                x < worldRect.right &&
                y + h > worldRect.top &&
                y < worldRect.bottom
            ) {
                if (plugin) {
                    this.create(plugin, entry);
                }
                toRemove.push(id);
                count++;
            }
        }

        for (const id of toRemove) {
            this.deferred.delete(id);
        }
        return count;
    }

    /** Remove all cards and deferred entries */
    clear() {
        for (const [id, el] of this.cards) {
            const type = el.dataset.cardType;
            if (type) this.plugins.get(type)?.onDestroy?.(el);
            el.remove();
        }
        this.cards.clear();
        this.deferred.clear();
        this.selected.clear();
    }

    // ─── Z-order ─────────────────────────────────────────

    bringToFront(el: HTMLElement) {
        this.topZ++;
        el.style.zIndex = String(this.topZ);
    }

    // ─── Selection ───────────────────────────────────────

    select(id: string, multi = false) {
        if (!multi) {
            this.deselectAll();
        }
        this.selected.add(id);
        this.cards.get(id)?.classList.add('gd-card--selected');
        this.bus.emit('card:select', { ids: [...this.selected] });
    }

    deselect(id: string) {
        this.selected.delete(id);
        this.cards.get(id)?.classList.remove('gd-card--selected');
        this.bus.emit('card:deselect', { ids: [id] });
    }

    deselectAll() {
        for (const id of this.selected) {
            this.cards.get(id)?.classList.remove('gd-card--selected');
        }
        const prev = [...this.selected];
        this.selected.clear();
        if (prev.length > 0) {
            this.bus.emit('card:deselect', { ids: prev });
        }
    }

    // ─── Collapse ────────────────────────────────────────

    toggleCollapse(id: string) {
        const el = this.cards.get(id);
        if (!el) return;
        const collapsed = el.classList.toggle('gd-card--collapsed');
        this.bus.emit('card:collapse', { id, collapsed });
    }

    // ─── Drag interaction ────────────────────────────────

    private setupDrag(card: HTMLElement) {
        const header = card.querySelector('.gd-card-header') as HTMLElement | null;
        const handle = header || card;

        let dragging = false;
        let startWorldX = 0, startWorldY = 0;
        let cardStartX = 0, cardStartY = 0;

        handle.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button !== 0) return;
            // Don't start drag if clicking inside content
            if (header && e.target !== header && !header.contains(e.target as Node)) return;

            e.preventDefault();
            dragging = true;
            this.bringToFront(card);

            const world = this.state.screenToWorld(e.clientX, e.clientY);
            cardStartX = parseFloat(card.style.left) || 0;
            cardStartY = parseFloat(card.style.top) || 0;
            startWorldX = world.x;
            startWorldY = world.y;
            card.classList.add('gd-card--dragging');

            const onMove = (ev: MouseEvent) => {
                if (!dragging) return;
                const curr = this.state.screenToWorld(ev.clientX, ev.clientY);
                let newX = cardStartX + (curr.x - startWorldX);
                let newY = cardStartY + (curr.y - startWorldY);

                // Snap to grid
                if (this.opts.gridSize > 0 && ev.shiftKey) {
                    newX = Math.round(newX / this.opts.gridSize) * this.opts.gridSize;
                    newY = Math.round(newY / this.opts.gridSize) * this.opts.gridSize;
                }

                card.style.left = `${newX}px`;
                card.style.top = `${newY}px`;
            };

            const onUp = () => {
                dragging = false;
                card.classList.remove('gd-card--dragging');
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);

                const x = parseFloat(card.style.left) || 0;
                const y = parseFloat(card.style.top) || 0;
                this.bus.emit('card:move', { id: card.dataset.cardId!, x, y });
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    // ─── Resize interaction ──────────────────────────────

    private setupResize(card: HTMLElement, type: string) {
        const handle = document.createElement('div');
        handle.className = 'gd-resize-handle';
        card.appendChild(handle);

        let resizing = false;
        let startW = 0, startH = 0, startX = 0, startY = 0;

        handle.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            resizing = true;
            startW = card.offsetWidth;
            startH = card.offsetHeight;
            startX = e.clientX;
            startY = e.clientY;
            card.classList.add('gd-card--resizing');

            const onMove = (ev: MouseEvent) => {
                if (!resizing) return;
                const dw = (ev.clientX - startX) / this.state.zoom;
                const dh = (ev.clientY - startY) / this.state.zoom;
                const w = Math.max(this.opts.minWidth, startW + dw);
                const h = Math.max(this.opts.minHeight, startH + dh);
                card.style.width = `${w}px`;
                card.style.height = `${h}px`;
                this.plugins.get(type)?.onResize?.(card, w, h);
            };

            const onUp = () => {
                resizing = false;
                card.classList.remove('gd-card--resizing');
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                this.bus.emit('card:resize', {
                    id: card.dataset.cardId!,
                    width: card.offsetWidth,
                    height: card.offsetHeight,
                });
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    // ─── Queries ─────────────────────────────────────────

    /** Check if a plugin says it handles wheel events for a target element */
    consumesWheel(target: HTMLElement): boolean {
        // Walk up to find the card, then check its plugin
        const card = target.closest('.gd-card') as HTMLElement | null;
        if (!card) return false;
        const type = card.dataset.cardType;
        if (!type) return false;
        return this.plugins.get(type)?.consumesWheel?.(target) ?? false;
    }

    /** Check if a plugin says it handles mouse events for a target element */
    consumesMouse(target: HTMLElement): boolean {
        const card = target.closest('.gd-card') as HTMLElement | null;
        if (!card) return false;
        const type = card.dataset.cardType;
        if (!type) return false;
        return this.plugins.get(type)?.consumesMouse?.(target) ?? false;
    }
}
