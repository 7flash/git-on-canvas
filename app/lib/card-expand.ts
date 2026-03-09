// @ts-nocheck
/**
 * Card expand/collapse — toggle, fit-to-screen, font size, hidden lines indicator.
 *
 * Extracted from cards.tsx to reduce file size.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { savePosition, setPathExpandedInPositions } from './positions';
import { updateMinimap } from './canvas';
import { renderConnections } from './connections';

// Re-use card data store and content builder from cards.tsx (lazy import to avoid circular)
function getCardsDeps() {
    return require('./cards');
}

const DEFAULT_CARD_HEIGHT = 700;

// ─── Hidden lines indicator ─────────────────────────────
export function updateHiddenLinesIndicator(card: HTMLElement, _totalLines?: number) {
    const body = card.querySelector('.file-card-body') as HTMLElement;
    if (!body) return;

    let indicator = card.querySelector('.hidden-lines-indicator') as HTMLElement;

    const lineEls = card.querySelectorAll('.diff-line');
    const totalLines = _totalLines && _totalLines > 0 ? _totalLines : lineEls.length;
    if (totalLines === 0) {
        if (indicator) indicator.style.display = 'none';
        return;
    }

    const cardH = card.offsetHeight;
    const headerH = (card.querySelector('.file-card-header') as HTMLElement)?.offsetHeight || 36;
    const pathH = (card.querySelector('.file-path') as HTMLElement)?.offsetHeight || 18;
    const availableH = cardH - headerH - pathH - 8;
    const pre = body.querySelector('.file-content-preview pre') as HTMLElement;
    const fontSize = pre ? parseFloat(getComputedStyle(pre).fontSize) : 8.5;
    const lineHeight = fontSize * 1.1;
    const visibleLines = Math.floor(availableH / lineHeight);
    const hiddenLines = totalLines - visibleLines;

    if (hiddenLines > 2) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'hidden-lines-indicator';
            card.appendChild(indicator);
        }
        indicator.textContent = `⋯ ${hiddenLines} more lines · Ctrl+/− to zoom`;
        indicator.style.display = '';
    } else if (indicator) {
        indicator.style.display = 'none';
    }
}

// ─── Change card font size (Ctrl +/-) ─────────────────
export function changeCardsFontSize(ctx: CanvasContext, delta: number) {
    const selected = ctx.snap().context.selectedCards;
    const targets = selected.length > 0 ? selected : Array.from(ctx.fileCards.keys());

    targets.forEach(path => {
        const card = ctx.fileCards.get(path);
        if (!card) return;
        const pre = card.querySelector('.file-content-preview pre') as HTMLElement;
        if (!pre) return;
        const current = parseFloat(getComputedStyle(pre).fontSize) || 8.5;
        const newSize = Math.max(5, Math.min(24, current + delta));
        pre.style.fontSize = `${newSize}px`;
        pre.style.lineHeight = '1.1';
        updateHiddenLinesIndicator(card, 0);
    });
}

// ─── Toggle card expand/collapse ────────────────────────
export function toggleCardExpand(ctx: CanvasContext) {
    measure('cards:toggleExpand', () => {
        const selected = ctx.snap().context.selectedCards;
        if (selected.length === 0) return;

        const firstCard = ctx.fileCards.get(selected[0]);
        if (!firstCard) return;
        const willExpand = firstCard.dataset.expanded !== 'true';

        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const expandHeight = Math.max(600, vpRect.height - 40);

        // Lazy import to get cardFileData and _buildFileContentHTML
        const { _getCardFileData, _buildFileContentHTML } = getCardsDeps();

        selected.forEach(path => {
            const card = ctx.fileCards.get(path);
            if (!card) return;

            const body = card.querySelector('.file-card-body') as HTMLElement;
            if (!body) return;

            if (!willExpand) {
                card.style.height = `${DEFAULT_CARD_HEIGHT}px`;
                card.style.maxHeight = `${DEFAULT_CARD_HEIGHT}px`;
                card.dataset.expanded = 'false';
                setPathExpandedInPositions(ctx, path, false);
            } else {
                card.style.height = `${expandHeight}px`;
                card.style.maxHeight = 'none';
                card.dataset.expanded = 'true';
                setPathExpandedInPositions(ctx, path, true);
            }

            // Re-render content: expanded shows ALL lines, collapsed shows VISIBLE_LINE_LIMIT
            const file = _getCardFileData(card);
            if (file && file.content && !file.isBinary) {
                if (!ctx.useCanvasText) {
                    const addedLines: Set<number> = file.addedLines || new Set();
                    const deletedBeforeLine: Map<number, string[]> = file.deletedBeforeLine || new Map();
                    const isAllAdded = file.status === 'added';
                    const isAllDeleted = file.status === 'deleted';
                    const preview = body.querySelector('.file-content-preview');
                    if (preview) {
                        const newHTML = _buildFileContentHTML(
                            file.content, file.layerSections, addedLines, deletedBeforeLine,
                            isAllAdded, isAllDeleted, willExpand, file.lines
                        );
                        preview.outerHTML = newHTML;
                    }
                }
            }

            const state = ctx.snap().context;
            const commitHash = state.currentCommitHash || 'allfiles';
            const newH = card.offsetHeight;
            ctx.actor.send({ type: 'RESIZE_CARD', path, width: card.offsetWidth, height: newH });
            savePosition(ctx, commitHash, path, parseInt(card.style.left) || 0, parseInt(card.style.top) || 0, card.offsetWidth, newH);

            requestAnimationFrame(() => updateHiddenLinesIndicator(card, 0));
        });

        updateMinimap(ctx);
        renderConnections(ctx);
    });
}

// ─── Expand a single card by path ───────────────────────
export function expandCardByPath(ctx: CanvasContext, path: string) {
    const card = ctx.fileCards.get(path);
    if (!card || card.dataset.expanded === 'true') return;

    const body = card.querySelector('.file-card-body') as HTMLElement;
    if (!body) return;

    const vpRect = ctx.canvasViewport.getBoundingClientRect();
    const expandHeight = Math.max(600, vpRect.height - 40);

    card.style.height = `${expandHeight}px`;
    card.style.maxHeight = 'none';
    card.dataset.expanded = 'true';
    setPathExpandedInPositions(ctx, path, true);

    const { _getCardFileData, _buildFileContentHTML } = getCardsDeps();
    const file = _getCardFileData(card);
    if (file && file.content && !file.isBinary) {
        if (!ctx.useCanvasText) {
            const addedLines: Set<number> = file.addedLines || new Set();
            const deletedBeforeLine: Map<number, string[]> = file.deletedBeforeLine || new Map();
            const isAllAdded = file.status === 'added';
            const isAllDeleted = file.status === 'deleted';
            const preview = body.querySelector('.file-content-preview');
            if (preview) {
                const newHTML = _buildFileContentHTML(
                    file.content, file.layerSections, addedLines, deletedBeforeLine,
                    isAllAdded, isAllDeleted, true, file.lines
                );
                preview.outerHTML = newHTML;
            }
        }
    }

    const state = ctx.snap().context;
    const commitHash = state.currentCommitHash || 'allfiles';
    ctx.actor.send({ type: 'RESIZE_CARD', path, width: card.offsetWidth, height: expandHeight });
    savePosition(ctx, commitHash, path, parseInt(card.style.left) || 0, parseInt(card.style.top) || 0, card.offsetWidth, expandHeight);
    requestAnimationFrame(() => updateHiddenLinesIndicator(card, 0));
}

// ─── Fit selected cards to screen viewport ──────────────
export function fitScreenSize(ctx: CanvasContext) {
    measure('cards:fitScreen', () => {
        const selected = ctx.snap().context.selectedCards;
        if (selected.length === 0) return;

        const viewport = ctx.canvasViewport;
        if (!viewport) return;

        const state = ctx.snap().context;
        const vh = viewport.clientHeight / state.zoom;
        const padding = 40;
        const fitH = Math.max(120, vh - padding * 2);

        selected.forEach(path => {
            const card = ctx.fileCards.get(path);
            if (!card) return;

            const currentW = card.offsetWidth;
            card.style.height = `${fitH}px`;
            card.style.maxHeight = 'none';

            const commitHash = state.currentCommitHash || 'allfiles';
            ctx.actor.send({ type: 'RESIZE_CARD', path, width: currentW, height: fitH });
            savePosition(ctx, commitHash, path, parseInt(card.style.left) || 0, parseInt(card.style.top) || 0, currentW, fitH);

            requestAnimationFrame(() => updateHiddenLinesIndicator(card, 0));
        });

        updateMinimap(ctx);
        renderConnections(ctx);
    });
}
