/**
 * ViewportCuller — Hide/show cards based on viewport visibility
 *
 * Uses content-visibility: hidden for off-screen cards (keeps dimensions
 * for layout stability) and materializes deferred cards on demand.
 */

import type { CanvasState } from './state';
import type { CardManager } from './cards';
import type { EventBus } from './events';

export interface CullResult {
    shown: number;
    culled: number;
    materialized: number;
    total: number;
}

export class ViewportCuller {
    private rafPending = false;
    private enabled = true;
    /** Margin in screen pixels beyond the viewport for pre-rendering */
    margin = 500;

    constructor(
        private state: CanvasState,
        private cards: CardManager,
        private bus: EventBus,
    ) { }

    /** Enable/disable culling */
    setEnabled(enabled: boolean) {
        this.enabled = enabled;
    }

    /** Schedule a culling pass on the next animation frame */
    schedule() {
        if (this.rafPending || !this.enabled) return;
        this.rafPending = true;
        requestAnimationFrame(() => {
            this.rafPending = false;
            this.perform();
        });
    }

    /** Perform immediate culling pass */
    perform(): CullResult {
        const result: CullResult = { shown: 0, culled: 0, materialized: 0, total: 0 };
        if (!this.enabled) return result;

        const worldRect = this.state.getVisibleWorldRect(this.margin);
        if (!worldRect) return result;

        // 1. Cull/show existing DOM cards
        for (const [id, card] of this.cards.cards) {
            const visible = this.isCardInRect(card, worldRect);
            const wasCulled = card.dataset.culled === 'true';

            if (visible && wasCulled) {
                card.style.contentVisibility = '';
                card.style.visibility = '';
                card.dataset.culled = 'false';
                result.shown++;
            } else if (!visible && !wasCulled) {
                card.style.contentVisibility = 'hidden';
                card.style.visibility = 'hidden';
                card.dataset.culled = 'true';
                result.culled++;
            } else if (visible) {
                result.shown++;
            } else {
                result.culled++;
            }
        }

        // 2. Materialize deferred cards in viewport
        if (this.cards.deferred.size > 0) {
            result.materialized = this.cards.materializeInRect(worldRect);
        }

        result.total = this.cards.cards.size + this.cards.deferred.size;

        if (result.materialized > 0) {
            this.bus.emit('viewport:cull', result);
        }

        return result;
    }

    /** Force all cards visible (for operations that need to measure everything) */
    uncullAll() {
        for (const [, card] of this.cards.cards) {
            card.style.contentVisibility = '';
            card.style.visibility = '';
            card.dataset.culled = 'false';
        }
    }

    private isCardInRect(card: HTMLElement, rect: { left: number; top: number; right: number; bottom: number }): boolean {
        const x = parseFloat(card.style.left) || 0;
        const y = parseFloat(card.style.top) || 0;
        const w = card.offsetWidth || 400;
        const h = card.offsetHeight || 300;
        return x + w > rect.left && x < rect.right && y + h > rect.top && y < rect.bottom;
    }
}
