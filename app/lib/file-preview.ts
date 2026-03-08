// @ts-nocheck
/**
 * File Preview Tooltip — shows a mini code preview when hovering
 * over file cards at low zoom levels where text is unreadable.
 *
 * Activates at zoom < 0.35 (configurable via PREVIEW_ZOOM_THRESHOLD).
 * Displays: file name, language badge, first ~12 lines of code,
 * line count and file size.
 *
 * Architecture:
 * - Single shared tooltip element (avoids DOM thrashing)
 * - Debounced show (150ms) to prevent flicker during fast panning
 * - Positioned near cursor but clamped to viewport bounds
 * - Hides on mouseout, zoom change above threshold, or scroll
 */

import { getGalaxyDrawState } from './galaxydraw-bridge';

// ─── Config ──────────────────────────────────────────────
const PREVIEW_ZOOM_THRESHOLD = 0.35;
const PREVIEW_LINES = 12;
const SHOW_DELAY_MS = 180;
const OFFSET_X = 16;
const OFFSET_Y = 16;

// ─── State ───────────────────────────────────────────────
let tooltip: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let currentCardId: string | null = null;
let isInitialized = false;

// ─── Language detection ──────────────────────────────────
const LANG_MAP: Record<string, { label: string; color: string }> = {
    ts: { label: 'TS', color: '#3178c6' },
    tsx: { label: 'TSX', color: '#3178c6' },
    js: { label: 'JS', color: '#f7df1e' },
    jsx: { label: 'JSX', color: '#f7df1e' },
    py: { label: 'PY', color: '#3776ab' },
    rs: { label: 'RS', color: '#ce412b' },
    go: { label: 'GO', color: '#00add8' },
    css: { label: 'CSS', color: '#1572b6' },
    html: { label: 'HTML', color: '#e34f26' },
    json: { label: 'JSON', color: '#5bc0de' },
    md: { label: 'MD', color: '#083fa1' },
    toml: { label: 'TOML', color: '#9c4221' },
    yaml: { label: 'YAML', color: '#cb171e' },
    yml: { label: 'YAML', color: '#cb171e' },
    sh: { label: 'SH', color: '#4eaa25' },
    sql: { label: 'SQL', color: '#e38c00' },
    svg: { label: 'SVG', color: '#ffb13b' },
    vue: { label: 'VUE', color: '#42b883' },
    scss: { label: 'SCSS', color: '#cc6699' },
};

function getLang(fileName: string): { label: string; color: string } {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return LANG_MAP[ext] || { label: ext.toUpperCase() || 'FILE', color: '#888' };
}

// ─── Tooltip DOM ─────────────────────────────────────────
function ensureTooltip(): HTMLElement {
    if (tooltip) return tooltip;

    tooltip = document.createElement('div');
    tooltip.className = 'file-preview-tooltip';
    tooltip.style.cssText = `
        position: fixed;
        z-index: 9999;
        pointer-events: none;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        max-width: 420px;
        min-width: 280px;
        background: rgba(15, 15, 25, 0.95);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(124, 58, 237, 0.3);
        border-radius: 10px;
        box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.5),
            0 0 16px rgba(124, 58, 237, 0.15);
        overflow: hidden;
        font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.appendChild(tooltip);
    return tooltip;
}

function showTooltip(card: HTMLElement, screenX: number, screenY: number) {
    const el = ensureTooltip();

    // Extract file data from the card
    const fileName = card.dataset.path || card.querySelector('.file-name')?.textContent || 'Unknown';
    const shortName = fileName.split('/').pop() || fileName;
    const lang = getLang(shortName);

    // Get content from the card body
    const body = card.querySelector('.file-card-body');
    const codeLines: string[] = [];

    if (body) {
        // Try to extract text lines from rendered spans
        const lineEls = body.querySelectorAll('.line');
        if (lineEls.length > 0) {
            for (let i = 0; i < Math.min(PREVIEW_LINES, lineEls.length); i++) {
                codeLines.push(lineEls[i].textContent || '');
            }
        } else {
            // Fallback: raw text content
            const raw = body.textContent || '';
            const lines = raw.split('\n');
            for (let i = 0; i < Math.min(PREVIEW_LINES, lines.length); i++) {
                codeLines.push(lines[i]);
            }
        }
    }

    // Get line count from the card or data attribute
    const lineCountEl = card.querySelector('.file-meta span, .line-count');
    let lineCount = lineCountEl?.textContent || '';
    if (!lineCount) {
        const allLines = body?.querySelectorAll('.line');
        if (allLines) lineCount = `${allLines.length} lines`;
    }

    // Format path (remove filename for display)
    const dirPath = fileName.includes('/') ? fileName.substring(0, fileName.lastIndexOf('/')) : '';

    // Escape HTML
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Build preview HTML
    const codeHTML = codeLines.length > 0
        ? codeLines.map((l, i) =>
            `<span style="display:block;white-space:pre;overflow:hidden;text-overflow:ellipsis;">` +
            `<span style="color:rgba(124,58,237,0.4);width:28px;display:inline-block;text-align:right;margin-right:10px;user-select:none;">${i + 1}</span>` +
            `${esc(l)}</span>`
        ).join('')
        : `<span style="color:rgba(255,255,255,0.3);font-style:italic;">No content preview</span>`;

    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(0,0,0,0.4);border-bottom:1px solid rgba(124,58,237,0.15);">
            <span style="
                display:inline-block;
                padding:2px 7px;
                border-radius:4px;
                font-size:10px;
                font-weight:700;
                letter-spacing:0.5px;
                background:${lang.color}22;
                color:${lang.color};
                border:1px solid ${lang.color}44;
            ">${lang.label}</span>
            <span style="font-size:13px;font-weight:600;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(shortName)}</span>
            ${lineCount ? `<span style="margin-left:auto;font-size:10px;color:rgba(255,255,255,0.35);white-space:nowrap;">${esc(lineCount)}</span>` : ''}
        </div>
        ${dirPath ? `<div style="padding:4px 14px;font-size:10px;color:rgba(255,255,255,0.25);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(dirPath)}/</div>` : ''}
        <div style="padding:8px 14px 10px;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.45;color:rgba(255,255,255,0.65);overflow:hidden;max-height:220px;">
            ${codeHTML}
        </div>
    `;

    // Position: near mouse, clamped to viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const elW = 380; // approximate
    const elH = 300;

    let x = screenX + OFFSET_X;
    let y = screenY + OFFSET_Y;

    // Clamp right edge
    if (x + elW > vw - 12) x = screenX - elW - OFFSET_X;
    // Clamp bottom edge
    if (y + elH > vh - 12) y = screenY - elH - OFFSET_Y;
    // Clamp left/top
    x = Math.max(8, x);
    y = Math.max(8, y);

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
}

function hideTooltip() {
    if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
    }
    currentCardId = null;
    if (tooltip) {
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(4px)';
    }
}

// ─── Event handlers ──────────────────────────────────────
function onMouseMove(e: MouseEvent) {
    const gdState = getGalaxyDrawState();
    if (!gdState || gdState.zoom >= PREVIEW_ZOOM_THRESHOLD) {
        hideTooltip();
        return;
    }

    // Find the closest .file-card ancestor
    const target = e.target as HTMLElement;
    const card = target.closest?.('.file-card') as HTMLElement | null;

    if (!card) {
        hideTooltip();
        return;
    }

    const cardId = card.dataset.path || card.id || '';

    if (cardId === currentCardId) {
        // Already showing for this card — just reposition
        if (tooltip && tooltip.style.opacity === '1') {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let x = e.clientX + OFFSET_X;
            let y = e.clientY + OFFSET_Y;
            if (x + 380 > vw - 12) x = e.clientX - 380 - OFFSET_X;
            if (y + 300 > vh - 12) y = e.clientY - 300 - OFFSET_Y;
            x = Math.max(8, x);
            y = Math.max(8, y);
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        }
        return;
    }

    // New card — debounce show
    hideTooltip();
    currentCardId = cardId;
    showTimer = setTimeout(() => {
        // Re-verify zoom is still low
        const gd = getGalaxyDrawState();
        if (!gd || gd.zoom >= PREVIEW_ZOOM_THRESHOLD) return;
        showTooltip(card, e.clientX, e.clientY);
    }, SHOW_DELAY_MS);
}

function onMouseOut(e: MouseEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (related?.closest?.('.file-card')) return; // Still within a card
    hideTooltip();
}

// ─── Public API ──────────────────────────────────────────

/**
 * Initialize file preview tooltips on the canvas viewport.
 * Call once after the canvas is mounted.
 */
export function initFilePreview(viewportEl: HTMLElement) {
    if (isInitialized) return;
    isInitialized = true;

    viewportEl.addEventListener('mousemove', onMouseMove, { passive: true });
    viewportEl.addEventListener('mouseout', onMouseOut, { passive: true });

    // Hide on zoom change (catches scroll-zoom)
    viewportEl.addEventListener('wheel', () => {
        // Small delay to let zoom update first
        setTimeout(() => {
            const gd = getGalaxyDrawState();
            if (gd && gd.zoom >= PREVIEW_ZOOM_THRESHOLD) {
                hideTooltip();
            }
        }, 50);
    }, { passive: true });

    console.log('[file-preview] Initialized — shows below', PREVIEW_ZOOM_THRESHOLD.toFixed(0) + '% zoom');
}

/**
 * Destroy file preview tooltips. Call on cleanup.
 */
export function destroyFilePreview(viewportEl: HTMLElement) {
    viewportEl.removeEventListener('mousemove', onMouseMove);
    viewportEl.removeEventListener('mouseout', onMouseOut);
    if (tooltip) {
        tooltip.remove();
        tooltip = null;
    }
    isInitialized = false;
}
