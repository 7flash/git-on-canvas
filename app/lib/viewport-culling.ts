// @ts-nocheck
/**
 * Viewport culling — only render file cards visible in the current viewport.
 *
 * Cards outside the viewport have their content stripped (innerHTML = '')
 * and get `data-culled="true"`. When they scroll back into view, their
 * content is rebuilt from the stored file data.
 *
 * Uses a generous margin (1 viewport width/height padding) so cards
 * entering the viewport are already rendered before they become visible.
 *
 * Performance: O(n) per frame with n = total cards. The check is a simple
 * AABB overlap test — no spatial indexing needed for < 500 cards.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';

// ── Culling state ──────────────────────────────────────────
let _cullRafPending = false;
let _cullEnabled = true;

// Margin in viewport pixels — cards within this margin outside the visible
// area are pre-rendered so scrolling feels instant. 
const VIEWPORT_MARGIN = 500;

/**
 * Computes the visible world-coordinate rectangle from the current
 * viewport size, zoom, and offset.
 */
function getVisibleWorldRect(ctx: CanvasContext) {
    const state = ctx.snap().context;
    const vp = ctx.canvasViewport;
    if (!vp) return null;

    const vpW = vp.clientWidth;
    const vpH = vp.clientHeight;
    const { zoom, offsetX, offsetY } = state;

    // Convert viewport corners to world coordinates
    // viewport pixel (0,0) → world: (-offsetX / zoom, -offsetY / zoom)
    // viewport pixel (vpW,vpH) → world: ((vpW - offsetX) / zoom, (vpH - offsetY) / zoom)
    const worldLeft = (-offsetX - VIEWPORT_MARGIN) / zoom;
    const worldTop = (-offsetY - VIEWPORT_MARGIN) / zoom;
    const worldRight = (vpW - offsetX + VIEWPORT_MARGIN) / zoom;
    const worldBottom = (vpH - offsetY + VIEWPORT_MARGIN) / zoom;

    return { left: worldLeft, top: worldTop, right: worldRight, bottom: worldBottom };
}

/**
 * Checks if a card overlaps the visible world rectangle.
 */
function isCardVisible(card: HTMLElement, worldRect: { left: number; top: number; right: number; bottom: number }): boolean {
    const x = parseFloat(card.style.left) || 0;
    const y = parseFloat(card.style.top) || 0;
    // Use offsetWidth/Height if available, otherwise use reasonable defaults
    const w = card.offsetWidth || 580;
    const h = card.offsetHeight || 700;

    return (
        x + w > worldRect.left &&
        x < worldRect.right &&
        y + h > worldRect.top &&
        y < worldRect.bottom
    );
}

/**
 * Performs viewport culling on all file cards.
 * Cards outside the viewport get visibility:hidden + content-visibility:hidden
 * Cards inside the viewport get shown.
 * Also materializes deferred cards that enter the viewport (virtualization).
 */
export function performViewportCulling(ctx: CanvasContext) {
    if (!_cullEnabled || !ctx.canvas || ctx.fileCards.size === 0 && ctx.deferredCards.size === 0) return;

    const worldRect = getVisibleWorldRect(ctx);
    if (!worldRect) return;

    let culled = 0;
    let shown = 0;

    // 1. Cull/show existing DOM cards
    for (const [path, card] of ctx.fileCards) {
        const visible = isCardVisible(card, worldRect);
        const wasCulled = card.dataset.culled === 'true';

        if (visible && wasCulled) {
            // Card entering viewport — show it
            card.style.contentVisibility = '';
            card.style.visibility = '';
            card.dataset.culled = 'false';
            shown++;
        } else if (!visible && !wasCulled) {
            // Card leaving viewport — hide it (keep dimensions for layout)
            card.style.contentVisibility = 'hidden';
            card.style.visibility = 'hidden';
            card.dataset.culled = 'true';
            culled++;
        } else if (visible) {
            shown++;
        } else {
            culled++;
        }
    }

    // 2. Materialize deferred cards that are now in viewport
    if (ctx.deferredCards.size > 0) {
        let materialized = 0;
        const toRemove: string[] = [];

        for (const [path, entry] of ctx.deferredCards) {
            const { file, x, y, size, isChanged } = entry;
            const cardW = size?.width || 580;
            const cardH = size?.height || 700;

            // AABB check against world rect
            const inView = (
                x + cardW > worldRect.left &&
                x < worldRect.right &&
                y + cardH > worldRect.top &&
                y < worldRect.bottom
            );

            if (inView) {
                // Lazy-import to avoid circular dependency
                const { createAllFileCard, setupCardInteraction } = require('./cards');
                const card = createAllFileCard(ctx, file, x, y, size);
                if (isChanged) {
                    card.classList.add('file-card--changed');
                    card.dataset.changed = 'true';
                }
                ctx.canvas.appendChild(card);
                ctx.fileCards.set(path, card);
                toRemove.push(path);
                materialized++;
                shown++;
            }
        }

        // Remove materialized entries from deferred map
        for (const path of toRemove) {
            ctx.deferredCards.delete(path);
        }

        if (materialized > 0) {
            console.log(`[cull] Materialized ${materialized} deferred cards (${ctx.deferredCards.size} remaining)`);
        }
    }

    return { culled, shown, total: ctx.fileCards.size };
}

/**
 * Schedules a viewport culling pass on the next animation frame.
 * Debounced — multiple calls per frame only result in one culling pass.
 */
export function scheduleViewportCulling(ctx: CanvasContext) {
    if (_cullRafPending || !_cullEnabled) return;
    _cullRafPending = true;
    requestAnimationFrame(() => {
        _cullRafPending = false;
        performViewportCulling(ctx);
    });
}

/**
 * Enable/disable viewport culling.
 */
export function setViewportCullingEnabled(enabled: boolean) {
    _cullEnabled = enabled;
}

/**
 * Force all cards to be visible (disable culling effect).
 * Call this before operations that need to measure all cards (e.g. fitAll).
 * Also materializes all deferred cards so they can be measured.
 */
export function uncullAllCards(ctx: CanvasContext) {
    for (const [, card] of ctx.fileCards) {
        card.style.contentVisibility = '';
        card.style.visibility = '';
        card.dataset.culled = 'false';
    }

    // Materialize ALL deferred cards (needed for fitAll, arrangeGrid etc.)
    if (ctx.deferredCards.size > 0) {
        const { createAllFileCard } = require('./cards');
        for (const [path, entry] of ctx.deferredCards) {
            const { file, x, y, size, isChanged } = entry;
            const card = createAllFileCard(ctx, file, x, y, size);
            if (isChanged) {
                card.classList.add('file-card--changed');
                card.dataset.changed = 'true';
            }
            ctx.canvas.appendChild(card);
            ctx.fileCards.set(path, card);
        }
        console.log(`[uncull] Materialized all ${ctx.deferredCards.size} deferred cards`);
        ctx.deferredCards.clear();
    }
}
