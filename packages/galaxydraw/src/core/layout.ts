/**
 * LayoutManager — Persist and restore card positions/sizes
 *
 * Supports dual storage:
 * - localStorage (always available)
 * - Optional server-side provider (for multi-device sync)
 */

import type { CardManager, CardData } from './cards';
import type { EventBus } from './events';

export interface LayoutData {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    collapsed?: boolean;
}

/** Override this to add server-side persistence */
export interface LayoutProvider {
    save(key: string, layouts: LayoutData[]): Promise<void>;
    load(key: string): Promise<LayoutData[]>;
}

export class LayoutManager {
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private debounceMs = 300;
    private provider: LayoutProvider | null = null;

    constructor(
        private cards: CardManager,
        private bus: EventBus,
        private storagePrefix = 'galaxydraw',
    ) {
        // Auto-save on card move/resize
        this.bus.on('card:move', () => this.debounceSave());
        this.bus.on('card:resize', () => this.debounceSave());
    }

    /** Set a custom persistence provider (e.g. server-side) */
    setProvider(provider: LayoutProvider) {
        this.provider = provider;
    }

    /** Save current card layouts */
    async save(key: string) {
        const layouts: LayoutData[] = [];
        for (const [id, el] of this.cards.cards) {
            layouts.push({
                id,
                x: parseFloat(el.style.left) || 0,
                y: parseFloat(el.style.top) || 0,
                width: el.offsetWidth,
                height: el.offsetHeight,
                collapsed: el.classList.contains('gd-card--collapsed'),
            });
        }

        // Save to localStorage
        const lsKey = `${this.storagePrefix}:layout:${key}`;
        try {
            localStorage.setItem(lsKey, JSON.stringify(layouts));
        } catch { }

        // Save to provider
        if (this.provider) {
            try {
                await this.provider.save(key, layouts);
            } catch (err) {
                console.warn('[galaxydraw] Layout save to provider failed:', err);
            }
        }

        this.bus.emit('layout:save', { layouts });
    }

    /** Load layouts from storage */
    async load(key: string): Promise<LayoutData[]> {
        // Try provider first
        if (this.provider) {
            try {
                const remote = await this.provider.load(key);
                if (remote.length > 0) return remote;
            } catch { }
        }

        // Fall back to localStorage
        const lsKey = `${this.storagePrefix}:layout:${key}`;
        try {
            const raw = localStorage.getItem(lsKey);
            if (raw) return JSON.parse(raw);
        } catch { }

        return [];
    }

    /** Apply loaded layouts to existing cards */
    apply(layouts: LayoutData[]) {
        const layoutMap = new Map(layouts.map(l => [l.id, l]));

        for (const [id, el] of this.cards.cards) {
            const layout = layoutMap.get(id);
            if (!layout) continue;

            el.style.left = `${layout.x}px`;
            el.style.top = `${layout.y}px`;
            el.style.width = `${layout.width}px`;
            el.style.height = `${layout.height}px`;
            if (layout.collapsed) {
                el.classList.add('gd-card--collapsed');
            }
        }

        this.bus.emit('layout:restore', { layouts });
    }

    /** Clear saved layouts */
    reset(key: string) {
        const lsKey = `${this.storagePrefix}:layout:${key}`;
        try { localStorage.removeItem(lsKey); } catch { }
        this.bus.emit('layout:reset', {});
    }

    private _currentKey = '';
    setCurrentKey(key: string) { this._currentKey = key; }

    private debounceSave() {
        if (!this._currentKey) return;
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.save(this._currentKey);
        }, this.debounceMs);
    }
}
