// @ts-nocheck
/**
 * Canvas transform, zoom, minimap, fit-all.
 */
import { measure } from 'measure-fn';
import { updateStatusBarZoom } from './status-bar';
import type { CanvasContext } from './context';
import { scheduleViewportCulling, uncullAllCards, markTransformActive } from './viewport-culling';
import { getGalaxyDrawState } from './galaxydraw-bridge';

// ─── Minimap cached state (avoids full rebuild on every pan/zoom) ──
let _mmCache: {
    minX: number; minY: number; maxX: number; maxY: number;
    scale: number; mmW: number; mmH: number;
    dotEls: Map<string, { dot: HTMLElement; label: HTMLElement }>;
} | null = null;
let _mmRebuildTimer: any = null;

export function restoreViewport(ctx: CanvasContext) {
    const state = ctx.snap().context;
    if (!state.repoPath) return;
    try {
        const saved = localStorage.getItem(`gitcanvas:viewport:${state.repoPath}`);
        if (saved) {
            const vp = JSON.parse(saved);
            if (vp.zoom) ctx.actor.send({ type: 'SET_ZOOM', zoom: vp.zoom });
            if (vp.x !== undefined && vp.y !== undefined) ctx.actor.send({ type: 'SET_OFFSET', x: vp.x, y: vp.y });
        }
    } catch (e) { }
}

// ─── Update canvas CSS transform from state ─────────────
export function updateCanvasTransform(ctx: CanvasContext) {
    if (!ctx.canvas) return;
    markTransformActive(); // Signal that user is actively panning/zooming
    const state = ctx.snap().context;

    // Phase 2: delegate to GalaxyDraw state engine if available
    const gdState = getGalaxyDrawState();
    if (gdState) {
        // Sync XState → GalaxyDraw
        gdState.zoom = state.zoom;
        gdState.offsetX = state.offsetX;
        gdState.offsetY = state.offsetY;
        gdState.applyTransform();
    } else {
        // Fallback: manual transform (pre-bridge init)
        ctx.canvas.style.transform = `translate(${Math.round(state.offsetX)}px, ${Math.round(state.offsetY)}px) scale(${state.zoom})`;
    }

    // Cheap: only move the viewport rect using cached bounds
    updateMinimapViewport(ctx);
    // Schedule viewport culling (debounced to next rAF)
    scheduleViewportCulling(ctx);

    if (state.repoPath) {
        if ((window as any)._saveViewportTimer) clearTimeout((window as any)._saveViewportTimer);
        (window as any)._saveViewportTimer = setTimeout(() => {
            localStorage.setItem(`gitcanvas:viewport:${state.repoPath}`, JSON.stringify({
                zoom: state.zoom,
                x: state.offsetX,
                y: state.offsetY
            }));
        }, 300);
    }

    // Notify cursor sharing of viewport change
    window.dispatchEvent(new Event('gitcanvas:viewport-changed'));
}

// ─── Update zoom slider UI ──────────────────────────────
export function updateZoomUI(ctx: CanvasContext) {
    const state = ctx.snap().context;
    const slider = document.getElementById('zoomSlider') as HTMLInputElement;
    const value = document.getElementById('zoomValue');
    if (slider) slider.value = state.zoom;
    if (value) value.textContent = `${Math.round(state.zoom * 100)}%`;
    updateStatusBarZoom(state.zoom);
}

// ─── Cheap viewport-only minimap update ─────────────────
function updateMinimapViewport(ctx: CanvasContext) {
    const viewport = document.getElementById('minimapViewport');
    if (!viewport || !_mmCache || !ctx.canvasViewport) return;

    const state = ctx.snap().context;
    const canvasRect = ctx.canvasViewport.getBoundingClientRect();
    const { scale, minX, minY } = _mmCache;

    const vpWorldW = canvasRect.width / state.zoom;
    const vpWorldH = canvasRect.height / state.zoom;
    const vpWorldX = -state.offsetX / state.zoom;
    const vpWorldY = -state.offsetY / state.zoom;

    viewport.style.width = `${vpWorldW * scale}px`;
    viewport.style.height = `${vpWorldH * scale}px`;
    viewport.style.left = `${(vpWorldX - minX) * scale}px`;
    viewport.style.top = `${(vpWorldY - minY) * scale}px`;
}

// ─── Full minimap rebuild (debounced, expensive) ────────
export function updateMinimap(ctx: CanvasContext) {
    // Debounce full rebuilds to max once per 120ms
    if (_mmRebuildTimer) clearTimeout(_mmRebuildTimer);
    _mmRebuildTimer = setTimeout(() => {
        _mmRebuildTimer = null;
        _rebuildMinimap(ctx);
    }, 120);
    // Always do cheap viewport update immediately
    updateMinimapViewport(ctx);
}

/** Force an immediate full minimap rebuild (skip debounce). */
export function forceMinimapRebuild(ctx: CanvasContext) {
    if (_mmRebuildTimer) { clearTimeout(_mmRebuildTimer); _mmRebuildTimer = null; }
    _rebuildMinimap(ctx);
}

function _rebuildMinimap(ctx: CanvasContext) {
    const minimap = document.getElementById('minimap');
    const viewport = document.getElementById('minimapViewport');
    const state = ctx.snap().context;

    if (!minimap || !viewport) return;

    // Remove old labels/dots
    if (_mmCache) {
        _mmCache.dotEls.forEach(({ dot, label }) => { dot.remove(); label.remove(); });
    }

    // Calculate actual bounding box from all file cards (DOM + deferred)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const cardInfos: { x: number; y: number; w: number; h: number; name: string; status: string; path: string; changed: boolean; displayPath?: string }[] = [];

    ctx.fileCards.forEach((card, path) => {
        const x = parseFloat(card.style.left);
        const y = parseFloat(card.style.top);
        // Skip cards with invalid positions (NaN poisons Math.min/max)
        if (isNaN(x) || isNaN(y)) return;
        const w = card.offsetWidth || 580;
        const h = card.offsetHeight || 200;
        const name = path.split('/').pop() || path;
        const parts = path.split('/');
        const displayPath = parts.length > 1 ? parts.slice(-2).join('/') : name;
        const status = card.dataset.status || card.className.match(/file-card--(\w+)/)?.[1] || 'default';
        const changed = card.dataset.changed === 'true';

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);

        cardInfos.push({ x, y, w, h, name, displayPath, status, path, changed });
    });

    // Also include deferred cards (not yet in DOM but positioned on canvas)
    if (ctx.deferredCards) {
        ctx.deferredCards.forEach((entry, path) => {
            // Skip if already in fileCards (shouldn't happen, but safety)
            if (ctx.fileCards.has(path)) return;
            const x = entry.x;
            const y = entry.y;
            // Skip cards with invalid positions
            if (isNaN(x) || isNaN(y)) return;
            const w = entry.size?.width || 580;
            const h = entry.size?.height || 700;
            const name = path.split('/').pop() || path;
            const parts = path.split('/');
            const displayPath = parts.length > 1 ? parts.slice(-2).join('/') : name;
            const changed = !!entry.isChanged;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);

            cardInfos.push({ x, y, w, h, name, displayPath, status: changed ? 'modified' : 'default', path, changed });
        });
    }

    // If no cards, just hide viewport
    if (cardInfos.length === 0) {
        viewport.style.display = 'none';
        _mmCache = null;
        return;
    }
    viewport.style.display = '';

    // Add padding around content
    const pad = 200;
    minX -= pad; minY -= pad;
    maxX += pad; maxY += pad;

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const mmW = minimap.offsetWidth;
    const mmH = minimap.offsetHeight;

    // Guard: if minimap hasn't been laid out yet, defer rebuild
    if (mmW === 0 || mmH === 0 || contentW <= 0 || contentH <= 0) {
        requestAnimationFrame(() => _rebuildMinimap(ctx));
        return;
    }

    // Scale to fit content in minimap
    const scale = Math.min(mmW / contentW, mmH / contentH);

    // Build DOM in a fragment for one reflow
    const frag = document.createDocumentFragment();
    const dotEls = new Map<string, { dot: HTMLElement; label: HTMLElement }>();

    cardInfos.forEach((info, idx) => {
        const dotX = (info.x - minX) * scale;
        const dotY = (info.y - minY) * scale;
        const dotW = Math.max(2, info.w * scale);
        const dotH = Math.max(1, info.h * scale);

        // Colored dot for file
        const dot = document.createElement('div');
        const statusClass = ['added', 'modified', 'deleted', 'renamed', 'copied'].includes(info.status) ? info.status : 'default';
        dot.className = `minimap-dot minimap-dot--${statusClass}`;
        // In all-files mode, highlight changed files
        if (info.changed) {
            dot.classList.add('minimap-dot--changed');
        }
        dot.dataset.path = info.name;
        dot.style.cssText = `left:${dotX}px;top:${dotY}px;width:${dotW}px;height:${dotH}px`;
        frag.appendChild(dot);

        // File name label
        const label = document.createElement('div');
        label.className = 'minimap-label';
        label.textContent = info.name;
        label.style.cssText = `left:${dotX}px;top:${dotY}px;width:${dotW}px;height:${dotH}px`;

        if (dotH > dotW * 1.5) {
            const fontSize = Math.max(3, Math.min(dotW * 0.7, 7));
            label.style.fontSize = `${fontSize}px`;
            label.style.writingMode = 'vertical-rl';
            label.style.textOrientation = 'mixed';
            label.style.whiteSpace = 'nowrap';
        } else {
            const fontSize = Math.max(3, Math.min(dotH * 0.6, dotW * 0.15, 7));
            label.style.fontSize = `${fontSize}px`;
            label.style.whiteSpace = 'nowrap';
        }
        frag.appendChild(label);
        dotEls.set(info.path, { dot, label });

        // Hover tooltip: show enlarged file name
        dot.addEventListener('mouseenter', () => {
            // Remove any existing tooltip
            minimap.querySelector('.minimap-tooltip')?.remove();
            const tooltip = document.createElement('div');
            tooltip.className = 'minimap-tooltip';
            tooltip.textContent = info.displayPath;
            tooltip.style.left = `${dotX + dotW / 2}px`;
            tooltip.style.top = `${dotY}px`;
            minimap.appendChild(tooltip);
        });
        dot.addEventListener('mouseleave', () => {
            minimap.querySelector('.minimap-tooltip')?.remove();
        });
    });

    minimap.appendChild(frag);

    // Cache bounds + scale + elements for cheap viewport-only updates
    _mmCache = { minX, minY, maxX, maxY, scale, mmW, mmH, dotEls };

    // Viewport rectangle (immediate)
    const canvasRect = ctx.canvasViewport.getBoundingClientRect();
    const vpWorldW = canvasRect.width / state.zoom;
    const vpWorldH = canvasRect.height / state.zoom;
    const vpWorldX = -state.offsetX / state.zoom;
    const vpWorldY = -state.offsetY / state.zoom;

    viewport.style.width = `${vpWorldW * scale}px`;
    viewport.style.height = `${vpWorldH * scale}px`;
    viewport.style.left = `${(vpWorldX - minX) * scale}px`;
    viewport.style.top = `${(vpWorldY - minY) * scale}px`;
}

// ─── Jump to a specific file on the canvas ──────────────
export function jumpToFile(ctx: CanvasContext, filePath: string) {
    measure('canvas:jumpToFile', () => {
        let card = ctx.fileCards.get(filePath);
        let cardX: number, cardY: number, cardW: number, cardH: number;

        if (card) {
            cardX = parseFloat(card.style.left) || 0;
            cardY = parseFloat(card.style.top) || 0;
            cardW = card.offsetWidth || 580;
            cardH = card.offsetHeight || 200;
        } else if (ctx.deferredCards?.has(filePath)) {
            // Card is deferred (not yet in DOM) — get position from deferred data
            const entry = ctx.deferredCards.get(filePath)!;
            cardX = entry.x;
            cardY = entry.y;
            cardW = entry.size?.width || 580;
            cardH = entry.size?.height || 700;
        } else {
            // File not on current layer — try switching to its layer
            import('./layers').then(({ navigateToFileInLayer }) => {
                const switched = navigateToFileInLayer(ctx, filePath);
                if (switched) {
                    // Layer switched and canvas re-rendered — retry jump after re-render settles
                    setTimeout(() => jumpToFile(ctx, filePath), 500);
                }
            });
            return;
        }

        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const state = ctx.snap().context;

        // Target zoom: bring to readable level (at least 0.6, or current if already zoomed in)
        const targetZoom = Math.max(0.6, Math.min(state.zoom, 1));
        const newOffsetX = vpRect.width / 2 - (cardX + cardW / 2) * targetZoom;
        const newOffsetY = vpRect.height / 2 - (cardY + cardH / 2) * targetZoom;

        // Animate using CSS transition on the canvas element
        const canvasEl = ctx.canvas;
        if (canvasEl) {
            canvasEl.style.transition = 'transform 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        }

        ctx.actor.send({ type: 'SET_ZOOM', zoom: targetZoom });
        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform(ctx);
        updateZoomUI(ctx);
        updateMinimap(ctx);

        // Clean up transition after animation completes
        setTimeout(() => {
            if (canvasEl) {
                canvasEl.style.transition = '';
            }
            // Re-cull after animation settles (may need to materialize the card)
            scheduleViewportCulling(ctx);

            // Flash highlight on the card (may have been materialized by culling)
            const finalCard = ctx.fileCards.get(filePath);
            if (finalCard) {
                finalCard.style.outline = '2px solid var(--accent-primary)';
                finalCard.style.outlineOffset = '4px';
                setTimeout(() => {
                    finalCard.style.outline = '';
                    finalCard.style.outlineOffset = '';
                }, 1500);
            }
        }, 420);
    });
}

// ─── Fit all files in viewport ──────────────────────────
export function fitAllFiles(ctx: CanvasContext) {
    measure('canvas:fitAll', () => {
        if (ctx.fileCards.size === 0 && (!ctx.deferredCards || ctx.deferredCards.size === 0)) {
            if (!ctx.canvasViewport) return;
        }

        // Temporarily uncull all cards so offsetWidth/Height are measurable
        uncullAllCards(ctx);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        ctx.fileCards.forEach(card => {
            const x = parseInt(card.style.left);
            const y = parseInt(card.style.top);
            if (isNaN(x) || isNaN(y)) return; // Skip cards without positions
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + (card.offsetWidth || 580));
            maxY = Math.max(maxY, y + (card.offsetHeight || 700));
        });

        // Include deferred cards in bounds
        if (ctx.deferredCards) {
            ctx.deferredCards.forEach((entry) => {
                minX = Math.min(minX, entry.x);
                minY = Math.min(minY, entry.y);
                maxX = Math.max(maxX, entry.x + (entry.size?.width || 580));
                maxY = Math.max(maxY, entry.y + (entry.size?.height || 700));
            });
        }

        const viewportRect = ctx.canvasViewport.getBoundingClientRect();
        const contentWidth = maxX - minX + 100;
        const contentHeight = maxY - minY + 100;

        const newZoom = Math.min(
            viewportRect.width / contentWidth,
            viewportRect.height / contentHeight,
            1
        );

        const newOffsetX = (viewportRect.width - contentWidth * newZoom) / 2 - minX * newZoom + 50;
        const newOffsetY = (viewportRect.height - contentHeight * newZoom) / 2 - minY * newZoom + 50;

        ctx.actor.send({ type: 'SET_ZOOM', zoom: newZoom });
        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform(ctx); // this also schedules re-culling
        updateZoomUI(ctx);
    });
}

// ─── Setup minimap click + scroll + resize handler ──────
export function setupMinimapClick(ctx: CanvasContext) {
    measure('minimap:setupClick', () => {
        const minimap = document.getElementById('minimap');
        if (!minimap) return;

        // ── Resize handle ──
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'minimap-resize-handle';
        resizeHandle.textContent = '⤡';
        minimap.parentElement?.insertBefore(resizeHandle, minimap);
        // position handle at top-left of minimap
        resizeHandle.style.position = 'absolute';
        resizeHandle.style.bottom = `${minimap.offsetHeight - 2}px`;
        resizeHandle.style.right = `${minimap.offsetWidth - 2}px`;

        let isResizing = false;
        let resizeStartX = 0, resizeStartY = 0;
        let startW = 0, startH = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            startW = minimap.offsetWidth;
            startH = minimap.offsetHeight;
            document.body.style.cursor = 'nwse-resize';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            // Dragging top-left: moving left increases width, moving up increases height
            const dx = resizeStartX - e.clientX;
            const dy = resizeStartY - e.clientY;
            const newW = Math.max(100, Math.min(600, startW + dx));
            const newH = Math.max(70, Math.min(400, startH + dy));
            minimap.style.width = `${newW}px`;
            minimap.style.height = `${newH}px`;
            // Reposition handle
            resizeHandle.style.bottom = `${newH - 2}px`;
            resizeHandle.style.right = `${newW - 2}px`;
        });

        window.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                // Rebuild minimap to fit new size
                _rebuildMinimap(ctx);
            }
        });

        // Scroll over minimap → pan camera (same as Space+scroll on canvas)
        minimap.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const state = ctx.snap().context;
            const panSpeed = 1.5;

            if (e.shiftKey) {
                // Shift+scroll = horizontal pan
                const dx = e.deltaY * panSpeed;
                ctx.actor.send({ type: 'SET_OFFSET', x: state.offsetX - dx, y: state.offsetY });
            } else {
                // Vertical scroll = vertical pan, deltaX for horizontal
                const dy = e.deltaY * panSpeed;
                const dx = e.deltaX * panSpeed;
                ctx.actor.send({ type: 'SET_OFFSET', x: state.offsetX - dx, y: state.offsetY - dy });
            }

            updateCanvasTransform(ctx);
            updateMinimap(ctx);
        }, { passive: false });

        minimap.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;

            if (target.classList.contains('minimap-dot') && target.dataset.path) {
                for (const [path] of ctx.fileCards) {
                    const name = path.split('/').pop() || path;
                    if (name === target.dataset.path) {
                        jumpToFile(ctx, path);
                        return;
                    }
                }
                return;
            }

            const rect = minimap.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            ctx.fileCards.forEach((card) => {
                const x = parseFloat(card.style.left) || 0;
                const y = parseFloat(card.style.top) || 0;
                const w = card.offsetWidth || 580;
                const h = card.offsetHeight || 200;
                minX = Math.min(minX, x); minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
            });
            if (minX === Infinity) return;

            const pad = 200;
            minX -= pad; minY -= pad;
            maxX += pad; maxY += pad;
            const contentW = maxX - minX;
            const contentH = maxY - minY;
            const mmW = minimap.offsetWidth;
            const mmH = minimap.offsetHeight;
            const scale = Math.min(mmW / contentW, mmH / contentH);

            const worldX = clickX / scale + minX;
            const worldY = clickY / scale + minY;

            const state = ctx.snap().context;
            const vpRect = ctx.canvasViewport.getBoundingClientRect();
            const newOffsetX = vpRect.width / 2 - worldX * state.zoom;
            const newOffsetY = vpRect.height / 2 - worldY * state.zoom;

            ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
            updateCanvasTransform(ctx);
            updateMinimap(ctx);
        });
    });
}

// ─── Clear all cards from canvas ────────────────────────
export function clearCanvas(ctx: CanvasContext) {
    ctx.fileCards.forEach(card => card.remove());
    ctx.fileCards.clear();
    ctx.canvas?.querySelectorAll('.dir-label').forEach(el => el.remove());
    if (ctx.svgOverlay) ctx.svgOverlay.innerHTML = '';
}

// ─── Auto column count based on viewport width ─────────
export function getAutoColumnCount(ctx: CanvasContext): number {
    const vpWidth = ctx.canvasViewport?.getBoundingClientRect().width || window.innerWidth;
    const cardWidth = 580;
    const gap = 40;
    const margin = 100;
    return Math.max(1, Math.floor((vpWidth - margin) / (cardWidth + gap)));
}
