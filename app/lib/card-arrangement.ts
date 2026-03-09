// @ts-nocheck
/**
 * Card arrangement — row, column, grid layout for selected cards.
 * Extracted from cards.tsx for modularity.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { savePosition } from './positions';
import { updateMinimap } from './canvas';
import { renderConnections } from './connections';

// ─── Helpers ────────────────────────────────────────────
function getSelectedCardsInfo(ctx: CanvasContext) {
    const selected = ctx.snap().context.selectedCards;
    const infos = [];
    selected.forEach(path => {
        const card = ctx.fileCards.get(path);
        if (card) {
            infos.push({
                path, card,
                x: parseFloat(card.style.left) || 0,
                y: parseFloat(card.style.top) || 0,
                w: card.offsetWidth || 580,
                h: card.offsetHeight || 400,
            });
        }
    });
    infos.sort((a, b) => a.x - b.x || a.y - b.y);
    return infos;
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
            info.card.style.left = `${curX}px`;
            info.card.style.top = `${startY}px`;
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
            info.card.style.left = `${startX}px`;
            info.card.style.top = `${curY}px`;
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

        const colWidths = [];
        const rowHeights = [];
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
            info.card.style.left = `${x}px`;
            info.card.style.top = `${y}px`;
            savePosition(ctx, commitHash, info.path, x, y);
        });

        renderConnections(ctx);
        updateMinimap(ctx);
    });
}
