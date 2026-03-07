// @ts-nocheck
/**
 * FileCardPlugin — bridges galaxydraw's CardPlugin interface with
 * the existing file card rendering in cards.tsx.
 *
 * Phase 4 of the GalaxyDraw migration:
 * - Wraps createAllFileCard() and createFileCard() as a CardPlugin
 * - Enables CardManager to handle drag, resize, z-order, selection
 * - Enables ViewportCuller to handle virtualized rendering
 *
 * The plugin doesn't replace cards.tsx — it delegates to it.
 * This allows incremental migration without breaking the existing flow.
 */

import type { CardPlugin, CardData } from '../../packages/galaxydraw/src/core/cards';

// ─── File Card Plugin ─────────────────────────────────────

export const FILE_CARD_TYPE = 'file';
export const DIFF_CARD_TYPE = 'diff';

/**
 * Plugin for rendering source code file cards on the canvas.
 * Used by the "working tree" (all files) view.
 *
 * The render() method receives a CardData where:
 * - meta.file: the file data object (path, name, content, etc.)
 * - meta.ctx: the CanvasContext for interaction setup
 * - meta.savedSize: optional saved dimensions
 */
export function createFileCardPlugin(): CardPlugin {
    return {
        type: FILE_CARD_TYPE,

        render(data: CardData): HTMLElement {
            const { file, ctx, savedSize } = data.meta || {};
            if (!file || !ctx) {
                // Fallback: empty placeholder card
                const el = document.createElement('div');
                el.className = 'file-card';
                el.textContent = 'Missing file data';
                return el;
            }

            // Dynamically import to avoid circular dependencies
            // The actual rendering is still in cards.tsx
            // skipInteraction=true: CardManager handles drag/resize/z-order
            const { createAllFileCard } = require('./cards');
            const card = createAllFileCard(ctx, file, data.x, data.y, savedSize, true);
            return card;
        },

        onResize(card: HTMLElement, width: number, height: number) {
            // Dispatch the resize event that cards.tsx already listens for
            const path = card.dataset.path;
            if (path) {
                card.dispatchEvent(new CustomEvent('card-resized', {
                    detail: { path, width, height },
                }));
            }
        },

        onDestroy(card: HTMLElement) {
            // Clean up any scroll timers or event listeners
            // The card DOM is removed by CardManager, but we should
            // clean up any overlays or attached state
        },

        consumesWheel(target: HTMLElement): boolean {
            // File card bodies are scrollable — pass wheel events through
            return !!target.closest('.file-card-body');
        },

        consumesMouse(target: HTMLElement): boolean {
            // Buttons, links, and interactive elements within cards
            // should receive mouse events directly
            return !!(
                target.closest('button') ||
                target.closest('a') ||
                target.closest('.connect-btn') ||
                target.closest('.line-num') ||
                target.closest('.diff-hunk-header')
            );
        },
    };
}

/**
 * Plugin for rendering commit diff cards on the canvas.
 * Used by the "commit diff" view.
 */
export function createDiffCardPlugin(): CardPlugin {
    return {
        type: DIFF_CARD_TYPE,

        render(data: CardData): HTMLElement {
            const { file, ctx, commitHash } = data.meta || {};
            if (!file || !ctx) {
                const el = document.createElement('div');
                el.className = 'file-card';
                el.textContent = 'Missing diff data';
                return el;
            }

            const { createFileCard } = require('./cards');
            const card = createFileCard(ctx, file, data.x, data.y, commitHash, true);
            return card;
        },

        onResize(card: HTMLElement, width: number, height: number) {
            const path = card.dataset.path;
            if (path) {
                card.dispatchEvent(new CustomEvent('card-resized', {
                    detail: { path, width, height },
                }));
            }
        },

        onDestroy() { },

        consumesWheel(target: HTMLElement): boolean {
            return !!target.closest('.file-card-body');
        },

        consumesMouse(target: HTMLElement): boolean {
            return !!(
                target.closest('button') ||
                target.closest('a') ||
                target.closest('.connect-btn') ||
                target.closest('.diff-hunk-header')
            );
        },
    };
}
