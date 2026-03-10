// @ts-nocheck
/**
 * Viewport culling + LOD (Level of Detail) system
 *
 * Cards outside the viewport have their content stripped (innerHTML = '')
 * and get `data-culled="true"`. When they scroll back into view, their
 * content is rebuilt from the stored file data.
 *
 * LOD System (zoom-aware):
 *   zoom > LOD_ZOOM_THRESHOLD (0.25): Full file cards with content
 *   zoom <= LOD_ZOOM_THRESHOLD:       Lightweight "pill" placeholders
 *
 * This prevents mass-materialization when zooming out on large repos
 * (e.g. React with 6833 files). Instead of creating 6833 full DOM cards,
 * we create tiny colored rectangles that swap to full cards on zoom-in.
 *
 * Materialization throttle: When many deferred cards enter viewport at
 * once, we materialize them in batches (MAX_MATERIALIZE_PER_FRAME) to
 * prevent frame drops.
 *
 * Performance: O(n) per frame with n = total cards. The check is a simple
 * AABB overlap test — no spatial indexing needed for < 10K cards.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { materializeViewport } from './galaxydraw-bridge';

// ── Culling state ──────────────────────────────────────────
let _cullRafPending = false;
let _cullEnabled = true;

// Margin in viewport pixels — cards within this margin outside the visible
// area are pre-rendered so scrolling feels instant. 
const VIEWPORT_MARGIN = 500;

// LOD threshold: below this zoom level, use lightweight pill placeholders
const LOD_ZOOM_THRESHOLD = 0.25;

// Maximum deferred cards to materialize per animation frame
// Prevents frame drops when zooming out then back in on huge repos
const MAX_MATERIALIZE_PER_FRAME = 8;

// Cooldown: don't materialize during rapid pan/zoom — wait until settled
let _lastTransformTime = 0;
const MATERIALIZE_COOLDOWN_MS = 150;

/** Call from updateCanvasTransform to signal active interaction */
export function markTransformActive() {
    _lastTransformTime = performance.now();
}

// Track current LOD mode so we can detect transitions
let _currentLodMode: 'full' | 'pill' = 'full';

// Track pill elements for cleanup
const pillCards = new Map<string, HTMLElement>();

// ── Pinned cards — stay visible at any zoom level ──
const PINNED_STORAGE_KEY = 'gitmaps:pinnedCards';
let _pinnedCards: Set<string> = new Set();

try {
    const stored = localStorage.getItem(PINNED_STORAGE_KEY);
    if (stored) _pinnedCards = new Set(JSON.parse(stored));
} catch { }

function _savePinnedCards() {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([..._pinnedCards]));
}

/** Toggle pin state for a card. Returns new pin state. */
export function togglePinCard(path: string): boolean {
    if (_pinnedCards.has(path)) {
        _pinnedCards.delete(path);
    } else {
        _pinnedCards.add(path);
    }
    _savePinnedCards();
    return _pinnedCards.has(path);
}

/** Check if a card is pinned */
export function isPinned(path: string): boolean {
    return _pinnedCards.has(path);
}

/** Get all pinned card paths */
export function getPinnedCards(): Set<string> {
    return _pinnedCards;
}

// ── Status colors for pill cards
const PILL_COLORS: Record<string, string> = {
    'ts': '#3178c6',
    'tsx': '#3178c6',
    'js': '#f7df1e',
    'jsx': '#f7df1e',
    'json': '#292929',
    'css': '#264de4',
    'scss': '#cd6799',
    'html': '#e34f26',
    'md': '#083fa1',
    'py': '#3776ab',
    'rs': '#dea584',
    'go': '#00add8',
    'vue': '#42b883',
    'svelte': '#ff3e00',
    'toml': '#9c4221',
    'yaml': '#cb171e',
    'yml': '#cb171e',
    'sh': '#89e051',
    'sql': '#e38c00',
};

function getPillColor(path: string, isChanged: boolean): string {
    if (isChanged) return '#eab308'; // Yellow for changed files
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return PILL_COLORS[ext] || '#6b7280'; // Default gray
}

/**
 * Create a lightweight pill placeholder for a file.
 * ~3 DOM nodes vs ~100+ for a full card = massive perf win at low zoom.
 * Uses vertical text to fit file names in compact card footprint.
 */
function createPillCard(path: string, x: number, y: number, w: number, h: number, isChanged: boolean, animate = false): HTMLElement {
    const pill = document.createElement('div');
    pill.className = 'file-pill';
    pill.dataset.path = path;
    pill.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        width: ${w}px;
        height: ${h}px;
        background: ${getPillColor(path, isChanged)};
        border-radius: 6px;
        opacity: ${animate ? '0' : '0.9'};
        contain: layout style;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.12);
        overflow: hidden;
        cursor: pointer;
        user-select: none;
        transition: opacity 0.25s ease, box-shadow 0.2s ease, transform 0.25s ease;
        transform: ${animate ? 'scale(0.92)' : 'scale(1)'};
    `;

    // Animate pill entrance
    if (animate) {
        requestAnimationFrame(() => {
            pill.style.opacity = '0.9';
            pill.style.transform = 'scale(1)';
        });
    }

    // File name label — show parent dir for common ambiguous filenames
    const parts = path.split('/');
    const filename = parts.pop() || path;
    const AMBIGUOUS = ['route.ts', 'route.tsx', 'page.tsx', 'page.ts', 'index.ts', 'index.tsx', 'index.js', 'layout.tsx', 'middleware.ts'];
    const name = AMBIGUOUS.includes(filename) && parts.length > 0
        ? `${parts[parts.length - 1]}/${filename}`
        : filename;
    const label = document.createElement('span');
    label.className = 'file-pill-label';
    label.textContent = name;
    label.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-90deg);
        white-space: nowrap;
        font-size: 48px;
        font-weight: 700;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: ${h - 40}px;
        line-height: 1;
        letter-spacing: 2px;
        font-family: 'JetBrains Mono', monospace;
        text-shadow: 0 2px 8px rgba(0,0,0,0.7);
        pointer-events: none;
    `;
    pill.appendChild(label);

    return pill;
}

/**
 * Computes the visible world-coordinate rectangle from the current
 * viewport size, zoom, and offset.
 * Also returns zoom so callers don't need a separate ctx.snap().
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

    return { left: worldLeft, top: worldTop, right: worldRight, bottom: worldBottom, zoom };
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
 * Remove all pill placeholders from the canvas.
 */
function clearAllPills(ctx: CanvasContext) {
    for (const [, pill] of pillCards) {
        pill.remove();
    }
    pillCards.clear();
}

/**
 * Fade out all pills, then call cleanup callback.
 */
function fadeOutPills(onComplete?: () => void) {
    for (const [, pill] of pillCards) {
        pill.style.opacity = '0';
        pill.style.transform = 'scale(0.92)';
    }
    if (onComplete) {
        setTimeout(onComplete, 250);
    }
}

/**
 * Transition from pill mode to full mode: remove pills for cards that
 * have been fully materialized. Uses fade-out if pill is visible.
 */
function removePillForPath(path: string) {
    const pill = pillCards.get(path);
    if (pill) {
        // Fade out the pill as the card replaces it
        pill.style.opacity = '0';
        pill.style.transform = 'scale(0.92)';
        pillCards.delete(path);
        setTimeout(() => pill.remove(), 250);
    }
}

/**
 * Performs viewport culling on all file cards.
 * Cards outside the viewport get visibility:hidden + content-visibility:hidden
 * Cards inside the viewport get shown.
 * Also materializes deferred cards that enter the viewport (virtualization).
 * 
 * LOD: At low zoom, uses pill placeholders instead of full cards.
 */
export function performViewportCulling(ctx: CanvasContext) {
    if (!_cullEnabled || !ctx.canvas || ctx.fileCards.size === 0 && ctx.deferredCards.size === 0) return;

    const worldRect = getVisibleWorldRect(ctx);
    if (!worldRect) return;

    // Phase 4c: also materialize deferred CardManager cards
    materializeViewport(ctx);

    // Reuse zoom from worldRect (already snapped) — avoids redundant ctx.snap()
    const zoom = worldRect.zoom;
    const isLowZoom = zoom <= LOD_ZOOM_THRESHOLD;
    const newLodMode = isLowZoom ? 'pill' : 'full';

    let culled = 0;
    let shown = 0;

    // ── LOD mode transition (with smooth animation) ──
    if (newLodMode !== _currentLodMode) {
        if (newLodMode === 'pill') {
            // Transitioning to pill mode: hide full cards EXCEPT pinned ones
            for (const [path, card] of ctx.fileCards) {
                if (_pinnedCards.has(path)) {
                    // Pinned cards stay visible — scale down for readability
                    card.style.display = '';
                    card.dataset.culled = 'false';
                    card.dataset.pinned = 'true';
                    card.style.zIndex = '50';
                    continue;
                }
                card.style.display = 'none';
                card.dataset.culled = 'true';
            }
        } else {
            // Transitioning to full mode:
            // 1. Force-show ALL materialized full cards (they were hidden in pill mode)
            for (const [path, card] of ctx.fileCards) {
                card.style.display = '';
                card.style.contentVisibility = '';
                card.style.visibility = '';
                card.dataset.culled = 'false';
            }
            // 2. Remove all pills immediately (no fade — avoids ghost overlap)
            for (const [path, pill] of pillCards) {
                pill.style.display = 'none';
                pill.remove();
            }
            pillCards.clear();
        }
        _currentLodMode = newLodMode;
    }

    // 1. Handle existing DOM cards (cull/show)
    for (const [path, card] of ctx.fileCards) {
        if (isLowZoom) {
            // Pinned cards stay visible even in pill mode
            if (_pinnedCards.has(path)) {
                card.style.display = '';
                card.style.contentVisibility = '';
                card.style.visibility = '';
                card.dataset.culled = 'false';
                card.dataset.pinned = 'true';
                card.style.zIndex = '50';
                shown++;
                continue;
            }
            // In pill mode: force-hide non-pinned full cards
            card.style.display = 'none';
            card.dataset.culled = 'true';
            delete card.dataset.pinned;
            culled++;
            continue;
        }

        const visible = isCardVisible(card, worldRect);
        const wasCulled = card.dataset.culled === 'true';

        if (visible && wasCulled) {
            // Card entering viewport — show it with fade-in
            card.style.contentVisibility = '';
            card.style.visibility = '';
            card.style.opacity = '0';
            card.style.transition = 'opacity 0.25s ease';
            card.dataset.culled = 'false';
            removePillForPath(path);
            requestAnimationFrame(() => { card.style.opacity = ''; });
            // Cleanup transition once done to avoid overhead
            setTimeout(() => { card.style.transition = ''; }, 300);
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

    // 2. Handle pill mode — always create pills for visible items (deferred or materialized)
    if (isLowZoom) {
        // Create pills for deferred cards that are visible
        for (const [path, entry] of ctx.deferredCards) {
            const { file, x, y, size, isChanged } = entry;
            const cardW = size?.width || 580;
            const cardH = size?.height || 700;

            const inView = (
                x + cardW > worldRect.left &&
                x < worldRect.right &&
                y + cardH > worldRect.top &&
                y < worldRect.bottom
            );

            if (inView && !pillCards.has(path)) {
                const pill = createPillCard(path, x, y, cardW, cardH, !!isChanged, true);
                ctx.canvas.appendChild(pill);
                pillCards.set(path, pill);
            } else if (!inView && pillCards.has(path)) {
                removePillForPath(path);
            }
        }

        // Always create pills for existing DOM cards (even if deferredCards is empty)
        for (const [path, card] of ctx.fileCards) {
            if (!pillCards.has(path)) {
                const x = parseFloat(card.style.left) || 0;
                const y = parseFloat(card.style.top) || 0;
                const w = card.offsetWidth || 580;
                const h = card.offsetHeight || 700;
                const isChanged = card.dataset.changed === 'true';

                const inView = (
                    x + w > worldRect.left &&
                    x < worldRect.right &&
                    y + h > worldRect.top &&
                    y < worldRect.bottom
                );

                if (inView) {
                    const pill = createPillCard(path, x, y, w, h, isChanged, true);
                    ctx.canvas.appendChild(pill);
                    pillCards.set(path, pill);
                }
            }
        }

        // Clean up pills that scrolled out of view
        for (const [path, pill] of pillCards) {
            const x = parseFloat(pill.style.left) || 0;
            const y = parseFloat(pill.style.top) || 0;
            const w = parseFloat(pill.style.width) || 580;
            const h = parseFloat(pill.style.height) || 80;
            const inView = (
                x + w > worldRect.left &&
                x < worldRect.right &&
                y + h > worldRect.top &&
                y < worldRect.bottom
            );
            if (!inView) {
                removePillForPath(path);
            }
        }
    } else if (ctx.deferredCards.size > 0) {
        // 3. Full mode: materialize deferred cards (throttled)
        // Skip materialization during active pan/zoom to keep frames smooth
        const timeSinceTransform = performance.now() - _lastTransformTime;
        if (timeSinceTransform < MATERIALIZE_COOLDOWN_MS) {
            // Still actively panning — schedule a retry after cooldown
            setTimeout(() => scheduleViewportCulling(ctx), MATERIALIZE_COOLDOWN_MS);
            return { culled, shown, total: ctx.fileCards.size };
        }

        let materialized = 0;
        const toRemove: string[] = [];

        for (const [path, entry] of ctx.deferredCards) {
            if (materialized >= MAX_MATERIALIZE_PER_FRAME) break;
            // Skip hidden files — don't materialize them
            if (ctx.hiddenFiles.has(path)) { toRemove.push(path); continue; }

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
                removePillForPath(path);
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
            // If more cards need materializing, schedule another pass
            if (ctx.deferredCards.size > 0) {
                scheduleViewportCulling(ctx);
            }
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
    // Clear any pill placeholders
    clearAllPills(ctx);
    _currentLodMode = 'full';

    for (const [, card] of ctx.fileCards) {
        card.style.contentVisibility = '';
        card.style.visibility = '';
        card.dataset.culled = 'false';
    }

    // Materialize ALL deferred cards (needed for fitAll, arrangeGrid etc.)
    if (ctx.deferredCards.size > 0) {
        const { createAllFileCard } = require('./cards');
        for (const [path, entry] of ctx.deferredCards) {
            // Skip hidden files
            if (ctx.hiddenFiles.has(path)) continue;
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

/**
 * Setup event-delegated interaction for pill cards.
 * One listener on the canvas handles all pill clicks/drags/double-clicks.
 * Much more efficient than per-pill listeners.
 */
let _pillInteractionSetup = false;
export function setupPillInteraction(ctx: CanvasContext) {
    if (_pillInteractionSetup || !ctx.canvas) return;
    _pillInteractionSetup = true;

    let pillAction: null | 'pending' | 'move' = null;
    let pillTarget: HTMLElement | null = null;
    let pillStartX = 0, pillStartY = 0;
    let pillMoveInfos: { pill: HTMLElement; path: string; startLeft: number; startTop: number }[] = [];
    const DRAG_THRESHOLD = 5;

    ctx.canvas.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        const pill = (e.target as HTMLElement).closest('.file-pill') as HTMLElement;
        if (!pill) return;

        e.stopPropagation();
        pillTarget = pill;
        pillAction = 'pending';
        pillStartX = e.clientX;
        pillStartY = e.clientY;

        window.addEventListener('mousemove', onPillMove);
        window.addEventListener('mouseup', onPillUp);
    });

    // Native dblclick to open editor modal (consistent with card dblclick)
    ctx.canvas.addEventListener('dblclick', (e: MouseEvent) => {
        const pill = (e.target as HTMLElement).closest('.file-pill') as HTMLElement;
        if (!pill) return;
        e.stopPropagation();
        e.preventDefault();
        const pillPath = pill.dataset.path || '';
        if (pillPath) {
            const file = ctx.allFilesData?.find(f => f.path === pillPath) ||
                { path: pillPath, name: pillPath.split('/').pop(), lines: 0 };
            import('./file-modal').then(({ openFileModal }) => openFileModal(ctx, file));
        }
    });

    function onPillMove(e: MouseEvent) {
        if (!pillTarget) return;
        const state = ctx.snap().context;
        const dx = (e.clientX - pillStartX) / state.zoom;
        const dy = (e.clientY - pillStartY) / state.zoom;

        if (pillAction === 'pending') {
            const dist = Math.sqrt((e.clientX - pillStartX) ** 2 + (e.clientY - pillStartY) ** 2);
            if (dist < DRAG_THRESHOLD) return;

            pillAction = 'move';
            const pillPath = pillTarget.dataset.path || '';

            // If this pill isn't selected yet, select it
            const selected = state.selectedCards;
            if (!selected.includes(pillPath)) {
                if (!e.shiftKey && !e.ctrlKey) {
                    ctx.actor.send({ type: 'SELECT_CARD', path: pillPath, shift: false });
                } else {
                    ctx.actor.send({ type: 'SELECT_CARD', path: pillPath, shift: true });
                }
                updatePillSelectionHighlights(ctx);
            }

            // Collect all selected pills for multi-drag
            const nowSelected = ctx.snap().context.selectedCards;
            pillMoveInfos = [];
            nowSelected.forEach(path => {
                const p = pillCards.get(path);
                if (p) {
                    pillMoveInfos.push({
                        pill: p,
                        path,
                        startLeft: parseFloat(p.style.left) || 0,
                        startTop: parseFloat(p.style.top) || 0,
                    });
                }
            });
        }

        if (pillAction === 'move') {
            pillMoveInfos.forEach(info => {
                info.pill.style.left = `${info.startLeft + dx}px`;
                info.pill.style.top = `${info.startTop + dy}px`;
            });
        }
    }

    function onPillUp(e: MouseEvent) {
        window.removeEventListener('mousemove', onPillMove);
        window.removeEventListener('mouseup', onPillUp);

        if (!pillTarget) return;
        const pillPath = pillTarget.dataset.path || '';

        if (pillAction === 'pending') {
            // Single click → select (double-click handled by native dblclick listener)
            if (e.shiftKey || e.ctrlKey) {
                ctx.actor.send({ type: 'SELECT_CARD', path: pillPath, shift: true });
            } else {
                ctx.actor.send({ type: 'SELECT_CARD', path: pillPath, shift: false });
            }
            updatePillSelectionHighlights(ctx);
        } else if (pillAction === 'move') {
            // Save new positions for all moved pills
            const { savePosition } = require('./positions');
            pillMoveInfos.forEach(info => {
                const newX = parseFloat(info.pill.style.left) || 0;
                const newY = parseFloat(info.pill.style.top) || 0;

                // Update deferred card position
                const deferred = ctx.deferredCards.get(info.path);
                if (deferred) {
                    deferred.x = newX;
                    deferred.y = newY;
                }

                // Update materialized card position too (if exists)
                const card = ctx.fileCards.get(info.path);
                if (card) {
                    card.style.left = `${newX}px`;
                    card.style.top = `${newY}px`;
                }

                savePosition(ctx, 'allfiles', info.path, newX, newY);
            });
            pillMoveInfos = [];
        }

        pillAction = null;
        pillTarget = null;
    }
}

/**
 * Update pill selection highlights based on XState selectedCards.
 */
function updatePillSelectionHighlights(ctx: CanvasContext) {
    const selected = ctx.snap().context.selectedCards;
    for (const [path, pill] of pillCards) {
        if (selected.includes(path)) {
            pill.style.outline = '8px solid rgba(124, 58, 237, 1)';
            pill.style.outlineOffset = '6px';
            pill.style.boxShadow = '0 0 0 6px rgba(124, 58, 237, 0.5), 0 0 60px 20px rgba(124, 58, 237, 0.6), 0 0 100px 40px rgba(124, 58, 237, 0.3)';
            pill.style.zIndex = '100';
            pill.style.filter = 'brightness(1.3)';
        } else {
            pill.style.outline = '';
            pill.style.outlineOffset = '';
            pill.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
            pill.style.zIndex = '';
            pill.style.filter = '';
        }
    }
    // Also update full card highlights
    const { updateSelectionHighlights } = require('./cards');
    updateSelectionHighlights(ctx);
}

