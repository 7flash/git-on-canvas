/**
 * EventBus — Type-safe pub/sub for canvas events
 *
 * Every action in the canvas (pan, zoom, card move, select, etc.)
 * flows through the event bus. This enables plugins to react to
 * state changes without tight coupling.
 */

export interface GalaxyDrawEvent {
    'canvas:pan': { offsetX: number; offsetY: number };
    'canvas:zoom': { zoom: number; centerX: number; centerY: number };
    'canvas:resize': { width: number; height: number };

    'card:create': { id: string; x: number; y: number };
    'card:move': { id: string; x: number; y: number };
    'card:resize': { id: string; width: number; height: number };
    'card:select': { ids: string[] };
    'card:deselect': { ids: string[] };
    'card:remove': { id: string };
    'card:collapse': { id: string; collapsed: boolean };
    'card:focus': { id: string };

    'layout:save': { layouts: any[] };
    'layout:restore': { layouts: any[] };
    'layout:reset': {};

    'viewport:cull': { shown: number; culled: number; materialized: number };

    'mode:change': { mode: 'simple' | 'advanced' };
}

export type EventHandler<K extends keyof GalaxyDrawEvent> = (data: GalaxyDrawEvent[K]) => void;

export class EventBus {
    private handlers = new Map<string, Set<Function>>();

    on<K extends keyof GalaxyDrawEvent>(event: K, handler: EventHandler<K>): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler);

        // Return unsubscribe function
        return () => {
            this.handlers.get(event)?.delete(handler);
        };
    }

    once<K extends keyof GalaxyDrawEvent>(event: K, handler: EventHandler<K>): () => void {
        const wrapper = (data: GalaxyDrawEvent[K]) => {
            unsub();
            handler(data);
        };
        const unsub = this.on(event, wrapper as any);
        return unsub;
    }

    emit<K extends keyof GalaxyDrawEvent>(event: K, data: GalaxyDrawEvent[K]): void {
        const handlers = this.handlers.get(event);
        if (!handlers) return;
        for (const handler of handlers) {
            try {
                handler(data);
            } catch (err) {
                console.error(`[galaxydraw] Event handler error for "${event}":`, err);
            }
        }
    }

    off<K extends keyof GalaxyDrawEvent>(event: K, handler?: EventHandler<K>): void {
        if (handler) {
            this.handlers.get(event)?.delete(handler);
        } else {
            this.handlers.delete(event);
        }
    }

    clear(): void {
        this.handlers.clear();
    }
}
