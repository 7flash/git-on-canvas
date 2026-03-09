// @ts-nocheck
/**
 * Card arrangement — row, column, grid layout for selected cards.
 * Extracted from cards.tsx for modularity.
 * 
 * Works with both materialized DOM cards and deferred/pill cards
 * so arrange functions work at any zoom level.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { savePosition } from './positions';
import { updateMinimap } from './canvas';
import { renderConnections } from './connections';

// ─── Helpers ────────────────────────────────────────────
interface CardInfo {
    path: string;
    card: HTMLElement | null; // null for deferred-only cards
    x: number;
    y: number;
    w: number;
    h: number;
}

function getSelectedCardsInfo(ctx: CanvasContext): CardInfo[] {
    const selected = ctx.snap().context.selectedCards;
    const infos: CardInfo[] = [];
    const seen = new Set<string>();

    // 1. Check materialized DOM cards (ctx.fileCards)
    selected.forEach(path => {
        const card = ctx.fileCards.get(path);
        if (card) {
            seen.add(path);
            const x = parseFloat(card.style.left);
            const y = parseFloat(card.style.top);
            if (isNaN(x) || isNaN(y)) return;
            infos.push({
                path, card,
                x, y,
                w: card.offsetWidth || 580,
                h: card.offsetHeight || 400,
            });
        }
    });

    // 2. Check deferred cards (not materialized yet — in pill/zoomed-out mode)
    if (ctx.deferredCards) {
        selected.forEach(path => {
            if (seen.has(path)) return;
            const entry = ctx.deferredCards.get(path);
            if (entry) {
                seen.add(path);
                const x = entry.x;
                const y = entry.y;
                if (isNaN(x) || isNaN(y)) return;
                infos.push({
                    path,
                    card: null, // no DOM card — will need to update pill + deferred entry
                    x, y,
                    w: entry.size?.width || 580,
                    h: entry.size?.height || 400,
                });
            }
        });
    }

    // 3. Check pill elements as last fallback
    if (infos.length < selected.length) {
        selected.forEach(path => {
            if (seen.has(path)) return;
            const pill = document.querySelector(`.file-card-pill[data-path="${CSS.escape(path)}"]`) as HTMLElement;
            if (pill) {
                const x = parseFloat(pill.style.left);
                const y = parseFloat(pill.style.top);
                if (isNaN(x) || isNaN(y)) return;
                infos.push({
                    path, card: null,
                    x, y,
                    w: pill.offsetWidth || 580,
                    h: pill.offsetHeight || 400,
                });
            }
        });
    }

    infos.sort((a, b) => a.x - b.x || a.y - b.y);
    return infos;
}

/** Apply new position to card, deferred entry, and pill */
function applyPosition(ctx: CanvasContext, info: CardInfo, newX: number, newY: number) {
    // Update DOM card if it exists
    if (info.card) {
        info.card.style.left = `${newX}px`;
        info.card.style.top = `${newY}px`;
    }

    // Update deferred entry
    const deferred = ctx.deferredCards?.get(info.path);
    if (deferred) {
        deferred.x = newX;
        deferred.y = newY;
    }

    // Update pill element
    const pill = document.querySelector(`.file-card-pill[data-path="${CSS.escape(info.path)}"]`) as HTMLElement;
    if (pill) {
        pill.style.left = `${newX}px`;
        pill.style.top = `${newY}px`;
    }
}

// ─── Arrange in a horizontal row ────────────────────────
export function arrangeRow(ctx: CanvasContext) {
    measure('arrange:row', () => {
        const infos = getSelectedCardsInfo(ctx);
        if (infos.length < 2) return;
        const startX = Math.min(...infos.map(i => i.x));
        const startY = Math.min(...infos.map(i => i.y));
        const gap = 40;
        let curX = startX;
        const commitHash = ctx.snap().context.currentCommitHash || 'allfiles';
        infos.forEach(info => {
            applyPosition(ctx, info, curX, startY);
            savePosition(ctx, commitHash, info.path, curX, startY);
            curX += info.w + gap;
        });
        renderConnections(ctx);
        updateMinimap(ctx);
    });
}

// ─── Arrange in a vertical column ───────────────────────
export function arrangeColumn(ctx: CanvasContext) {
    measure('arrange:column', () => {
        const infos = getSelectedCardsInfo(ctx);
        if (infos.length < 2) return;
        const startX = Math.min(...infos.map(i => i.x));
        const startY = Math.min(...infos.map(i => i.y));
        const gap = 40;
        let curY = startY;
        const commitHash = ctx.snap().context.currentCommitHash || 'allfiles';
        infos.forEach(info => {
            applyPosition(ctx, info, startX, curY);
            savePosition(ctx, commitHash, info.path, startX, curY);
            curY += info.h + gap;
        });
        renderConnections(ctx);
        updateMinimap(ctx);
    });
}

// ─── Arrange in a grid ──────────────────────────────────
export function arrangeGrid(ctx: CanvasContext) {
    measure('arrange:grid', () => {
        const infos = getSelectedCardsInfo(ctx);
        if (infos.length < 2) return;
        const cols = Math.ceil(Math.sqrt(infos.length));
        const startX = Math.min(...infos.map(i => i.x));
        const startY = Math.min(...infos.map(i => i.y));
        const gapX = 40, gapY = 40;

        const colWidths: number[] = [];
        const rowHeights: number[] = [];
        infos.forEach((info, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            colWidths[col] = Math.max(colWidths[col] || 0, info.w);
            rowHeights[row] = Math.max(rowHeights[row] || 0, info.h);
        });

        const commitHash = ctx.snap().context.currentCommitHash || 'allfiles';
        infos.forEach((info, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            let x = startX;
            for (let c = 0; c < col; c++) x += (colWidths[c] || 580) + gapX;
            let y = startY;
            for (let r = 0; r < row; r++) y += (rowHeights[r] || 400) + gapY;
            applyPosition(ctx, info, x, y);
            savePosition(ctx, commitHash, info.path, x, y);
        });

        renderConnections(ctx);
        updateMinimap(ctx);
    });
}
