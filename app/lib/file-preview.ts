// @ts-nocheck
/**
 * File Preview — renders the EXACT same card component when hovering
 * over pill placeholders or file cards at low zoom levels.
 *
 * Instead of a simplified tooltip with plain text, this clones or
 * re-renders the full file card (diff markers, syntax highlighting,
 * status badges, connections) and shows it in a fixed popup container
 * at readable scale.
 *
 * Architecture:
 * - Single shared popup container (avoids DOM thrashing)
 * - Debounced show (180ms) to prevent flicker during fast panning
 * - Looks up file data from ctx.fileCards (clone existing) or
 *   ctx.deferredCards (render fresh via createAllFileCard)
 * - Positioned near cursor, clamped to viewport bounds
 * - Hides on mouseout, zoom change above threshold, or scroll
 */

import { getGalaxyDrawState } from './galaxydraw-bridge';
import type { CanvasContext } from './context';

// ─── Config ──────────────────────────────────────────────
const PREVIEW_ZOOM_THRESHOLD = 0.25; // Match LOD_ZOOM_THRESHOLD in viewport-culling.ts
const SHOW_DELAY_MS = 180;
const OFFSET_X = 16;
const OFFSET_Y = 16;
const POPUP_MAX_W = 520;
const POPUP_MAX_H = 600;

// ─── State ───────────────────────────────────────────────
let popup: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let currentCardPath: string | null = null;
let isInitialized = false;
let _ctx: CanvasContext | null = null;
let isPreviewEnabled = localStorage.getItem('gitmaps:previewEnabled') !== 'false'; // enabled by default
let _isHoveringPopup = false;

// ─── Popup container ─────────────────────────────────────
function ensurePopup(): HTMLElement {
    if (popup) return popup;

    popup = document.createElement('div');
    popup.className = 'file-preview-popup';
    popup.style.cssText = `
        position: fixed;
        z-index: 9999;
        pointer-events: auto;
        opacity: 0;
        transform: translateY(6px) scale(0.97);
        transition: opacity 0.18s ease, transform 0.18s ease;
        max-width: ${POPUP_MAX_W}px;
        max-height: ${POPUP_MAX_H}px;
        overflow-y: auto;
        overflow-x: hidden;
        border-radius: 12px;
        box-shadow:
            0 12px 48px rgba(0, 0, 0, 0.6),
            0 0 0 1px rgba(124, 58, 237, 0.25),
            0 0 24px rgba(124, 58, 237, 0.12);
        background: var(--bg-primary, #0a0a14);
    `;
    // Keep popup visible while hovering over it (for scrolling)
    popup.addEventListener('mouseenter', () => { _isHoveringPopup = true; });
    popup.addEventListener('mouseleave', () => {
        _isHoveringPopup = false;
        hidePopup();
    });
    // Capture wheel events to scroll popup content, not zoom canvas
    popup.addEventListener('wheel', (e) => {
        e.stopPropagation();
        // Manually scroll the popup content
        popup.scrollTop += e.deltaY;
        e.preventDefault();
    }, { passive: false });
    document.body.appendChild(popup);
    return popup;
}

/**
 * Render the full card preview inside the popup container.
 * Strategy:
 *  1. If the card is already materialized in ctx.fileCards → deep clone it
 *  2. If it's deferred in ctx.deferredCards → render a fresh card
 *
 * Important: Canvas-text rendering (CanvasTextRenderer) doesn't survive
 * cloning, so we always force DOM-based HTML rendering for previews.
 */
function renderPreviewCard(path: string): HTMLElement | null {
    if (!_ctx) return null;

    // Strategy 1: Clone existing materialized card
    const existingCard = _ctx.fileCards.get(path);
    if (existingCard) {
        const clone = existingCard.cloneNode(true) as HTMLElement;
        // Reset positioning — we'll position the popup itself
        clone.style.position = 'relative';
        clone.style.left = '0';
        clone.style.top = '0';
        clone.style.display = 'block'; // CRITICAL: cards are display:none in pill mode
        clone.style.visibility = 'visible';
        clone.style.contentVisibility = 'visible';
        clone.style.opacity = '1';
        clone.style.maxHeight = 'none';
        clone.style.width = `${POPUP_MAX_W - 2}px`;
        clone.style.overflow = 'visible';
        clone.style.pointerEvents = 'auto';
        clone.style.transition = 'none';
        clone.style.transform = 'none';
        clone.style.outline = 'none';
        clone.style.boxShadow = 'none';
        delete clone.dataset.culled;
        delete clone.dataset.expanded;

        // Always re-render body with ALL lines (cards are 120-line limited)
        const { _getCardFileData, _buildFileContentHTML } = require('./cards');
        const file = _getCardFileData(existingCard);
        if (file?.content) {
            const addedLines = file.addedLines || new Set();
            const deletedBeforeLine = file.deletedBeforeLine || new Map();
            const isAllAdded = file.status === 'added';
            const isAllDeleted = file.status === 'deleted';
            const html = _buildFileContentHTML(
                file.content, file.layerSections, addedLines, deletedBeforeLine,
                isAllAdded, isAllDeleted, true, file.lines  // true = expanded, show ALL lines
            );
            // Replace body content with full file
            const body = clone.querySelector('.file-card-body');
            if (body) body.innerHTML = html;
            // Also replace canvas-text container if present
            const canvasContainer = clone.querySelector('.canvas-container');
            if (canvasContainer) canvasContainer.outerHTML = html;
        }

        return clone;
    }

    // Strategy 2: Render from deferred card data
    const deferred = _ctx.deferredCards.get(path);
    if (deferred) {
        // Temporarily force DOM rendering (canvas-text doesn't work in detached elements)
        const wasCanvasText = _ctx.useCanvasText;
        _ctx.useCanvasText = false;
        const { createAllFileCard } = require('./cards');
        const card = createAllFileCard(_ctx, deferred.file, 0, 0, null, true) as HTMLElement;
        _ctx.useCanvasText = wasCanvasText;
        card.style.position = 'relative';
        card.style.left = '0';
        card.style.top = '0';
        card.style.maxHeight = 'none';
        card.style.width = `${POPUP_MAX_W - 2}px`;
        card.style.overflow = 'visible';
        card.style.pointerEvents = 'auto';

        card.style.transition = 'none';
        return card;
    }

    return null;
}

// ─── Image preview support ───────────────────────────────
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);

function renderImagePreview(path: string): HTMLElement | null {
    if (!_ctx) return null;
    const state = _ctx.snap().context;
    const repoPath = state.repoPath;
    if (!repoPath) return null;

    const container = document.createElement('div');
    container.style.cssText = `
        padding: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    `;

    // File name label
    const label = document.createElement('div');
    label.style.cssText = 'font-size: 11px; color: var(--text-muted); font-family: monospace;';
    label.textContent = path.split('/').pop() || path;
    container.appendChild(label);

    // Image element
    const img = document.createElement('img');
    img.src = `/api/repo/file-raw?path=${encodeURIComponent(repoPath)}&filePath=${encodeURIComponent(path)}`;
    img.alt = path;
    img.style.cssText = `
        max-width: ${POPUP_MAX_W - 24}px;
        max-height: ${POPUP_MAX_H - 50}px;
        object-fit: contain;
        border-radius: 6px;
        background: repeating-conic-gradient(#222 0% 25%, #333 0% 50%) 50% / 16px 16px; /* checkerboard for transparency */
    `;
    img.onerror = () => {
        img.style.display = 'none';
        label.textContent = `⚠ Could not load: ${path.split('/').pop()}`;
    };
    container.appendChild(img);

    return container;
}

function showPopup(path: string, screenX: number, screenY: number) {
    const el = ensurePopup();

    // Check if this is an image file
    const ext = path.split('.').pop()?.toLowerCase() || '';
    let previewContent: HTMLElement | null;

    if (IMAGE_EXTENSIONS.has(ext)) {
        previewContent = renderImagePreview(path);
    } else {
        previewContent = renderPreviewCard(path);
    }

    if (!previewContent) {
        hidePopup();
        return;
    }

    // Clear previous and insert
    el.innerHTML = '';
    el.appendChild(previewContent);

    // Position: near mouse, clamped to viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = screenX + OFFSET_X;
    let y = screenY + OFFSET_Y;

    // Clamp right edge
    if (x + POPUP_MAX_W > vw - 12) x = screenX - POPUP_MAX_W - OFFSET_X;
    // Clamp bottom edge
    if (y + POPUP_MAX_H > vh - 12) y = screenY - POPUP_MAX_H - OFFSET_Y;
    // Clamp left/top
    x = Math.max(8, x);
    y = Math.max(8, y);

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0) scale(1)';
}

function hidePopup() {
    if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
    }
    currentCardPath = null;
    if (popup) {
        popup.style.opacity = '0';
        popup.style.transform = 'translateY(6px) scale(0.97)';
        // Clear content after fade to free memory
        setTimeout(() => {
            if (popup && popup.style.opacity === '0') {
                popup.innerHTML = '';
            }
        }, 200);
    }
}

// ─── Event handlers ──────────────────────────────────────
function onMouseMove(e: MouseEvent) {
    if (!isPreviewEnabled) return;
    if (_isHoveringPopup) return; // Don't hide while interacting with popup

    // Suppress popup during canvas panning (middle-button drag, space-held, isDragging)
    if (e.buttons & 4) { hidePopup(); return; } // middle mouse button held
    if (e.buttons & 1) { hidePopup(); return; } // left mouse button held (dragging)
    const viewport = document.querySelector('.canvas-viewport');
    if (viewport?.classList.contains('space-panning')) { hidePopup(); return; }
    if (_ctx?.isDragging) { hidePopup(); return; }

    const gdState = getGalaxyDrawState();
    if (!gdState || gdState.zoom >= PREVIEW_ZOOM_THRESHOLD) {
        hidePopup();
        return;
    }

    // Find the closest pill card or file card ancestor
    const target = e.target as HTMLElement;
    const pill = target.closest?.('.file-pill') as HTMLElement | null;
    const card = target.closest?.('.file-card') as HTMLElement | null;
    const element = pill || card;

    if (!element) {
        hidePopup();
        return;
    }

    const path = element.dataset.path || '';
    if (!path) {
        hidePopup();
        return;
    }

    if (path === currentCardPath) {
        // Already showing for this card — DON'T reposition.
        // Keep popup stationary so user can move their mouse to it for scrolling.
        return;
    }

    // New card — debounce show
    hidePopup();
    currentCardPath = path;
    showTimer = setTimeout(() => {
        // Re-verify zoom is still low
        const gd = getGalaxyDrawState();
        if (!gd || gd.zoom >= PREVIEW_ZOOM_THRESHOLD) return;
        showPopup(path, e.clientX, e.clientY);
    }, SHOW_DELAY_MS);
}

function onMouseOut(e: MouseEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.closest?.('.file-pill') || related?.closest?.('.file-card')) return;
    // Don't hide if mouse moved to the popup itself
    if (related?.closest?.('.file-preview-popup')) return;
    if (_isHoveringPopup) return;
    hidePopup();
}

/**
 * Wheel handler on viewport:
 *  - If popup visible + mouse over pill/placeholder + NO Ctrl → scroll popup
 *  - If Ctrl held → always let canvas zoom (never intercept)
 *  - If zoom crosses threshold → hide popup
 */
function onViewportWheel(e: WheelEvent) {
    // Ctrl+wheel = zoom → never intercept
    if (e.ctrlKey || e.metaKey) {
        // Check if zoom crossed threshold after a tick
        if (currentCardPath) {
            setTimeout(() => {
                const gd = getGalaxyDrawState();
                if (gd && gd.zoom >= PREVIEW_ZOOM_THRESHOLD) hidePopup();
            }, 50);
        }
        return;
    }

    // If popup is visible and user is hovering over the pill/card that triggered it,
    // forward wheel events to scroll the popup content
    if (popup && currentCardPath && popup.style.opacity === '1') {
        const target = e.target as HTMLElement;
        const pill = target.closest?.('.file-pill') as HTMLElement | null;
        const card = target.closest?.('.file-card') as HTMLElement | null;
        const element = pill || card;
        if (element && element.dataset.path === currentCardPath) {
            // Only intercept if popup has scrollable content
            if (popup.scrollHeight > popup.clientHeight) {
                e.preventDefault();
                e.stopPropagation();
                popup.scrollTop += e.deltaY;
            }
        }
    }
}

// ─── Public API ──────────────────────────────────────────

/**
 * Initialize file preview on the canvas viewport.
 * Call once after the canvas is mounted.
 * @param viewportEl - The canvas viewport element
 * @param ctx - The CanvasContext for looking up file data
 */
export function initFilePreview(viewportEl: HTMLElement, ctx?: CanvasContext) {
    if (isInitialized) return;
    isInitialized = true;
    if (ctx) _ctx = ctx;

    viewportEl.addEventListener('mousemove', onMouseMove, { passive: true });
    viewportEl.addEventListener('mouseout', onMouseOut, { passive: true });

    // Wheel: scroll popup when hovering pill, Ctrl+wheel always zooms
    viewportEl.addEventListener('wheel', onViewportWheel, { passive: false });

    console.log('[file-preview] Initialized — full card preview below', (PREVIEW_ZOOM_THRESHOLD * 100).toFixed(0) + '% zoom');
}

/**
 * Destroy file preview. Call on cleanup.
 */
export function destroyFilePreview(viewportEl: HTMLElement) {
    viewportEl.removeEventListener('mousemove', onMouseMove);
    viewportEl.removeEventListener('mouseout', onMouseOut);
    viewportEl.removeEventListener('wheel', onViewportWheel);
    if (popup) {
        popup.remove();
        popup = null;
    }
    _ctx = null;
    isInitialized = false;
}

/**
 * Toggle file preview on/off. Persists to localStorage.
 */
export function toggleFilePreview(): boolean {
    isPreviewEnabled = !isPreviewEnabled;
    localStorage.setItem('gitmaps:previewEnabled', String(isPreviewEnabled));
    if (!isPreviewEnabled) hidePopup();
    return isPreviewEnabled;
}

/**
 * Set file preview enabled state. Persists to localStorage.
 */
export function setFilePreviewEnabled(enabled: boolean) {
    isPreviewEnabled = enabled;
    localStorage.setItem('gitmaps:previewEnabled', String(enabled));
    if (!enabled) hidePopup();
}

/**
 * Get current preview enabled state.
 */
export function isFilePreviewEnabled(): boolean {
    return isPreviewEnabled;
}
