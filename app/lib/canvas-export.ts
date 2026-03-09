// @ts-nocheck
/**
 * Canvas Export — capture the current canvas view as PNG.
 *
 * Two modes:
 * 1. Viewport capture: exports what's currently visible on screen
 * 2. Full canvas: exports ALL cards at their actual positions (may be large)
 *
 * Uses a <canvas> element to render card thumbnails with file names,
 * diff markers, and connection lines. No external dependencies.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { getGalaxyDrawState } from './galaxydraw-bridge';

// ─── Config ──────────────────────────────────────────────
const CARD_BG = '#1a1a2e';
const CARD_BORDER = '#2d2d44';
const CARD_HEADER_BG = '#252540';
const TEXT_COLOR = '#e2e8f0';
const MUTED_COLOR = '#64748b';
const ACCENT = '#7c3aed';
const ADD_COLOR = '#22c55e';
const DEL_COLOR = '#ef4444';
const MOD_COLOR = '#eab308';

const LANG_COLORS: Record<string, string> = {
    ts: '#3178c6', tsx: '#3178c6', js: '#f7df1e', jsx: '#f7df1e',
    py: '#3776ab', rs: '#ce412b', go: '#00add8', css: '#1572b6',
    html: '#e34f26', json: '#5bc0de', md: '#083fa1', toml: '#9c4221',
};

function getLangColor(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return LANG_COLORS[ext] || '#888';
}

// ─── Get card bounds ─────────────────────────────────────
function getAllCardBounds(ctx: CanvasContext): { x: number; y: number; w: number; h: number; path: string; changed: boolean }[] {
    const cards: { x: number; y: number; w: number; h: number; path: string; changed: boolean }[] = [];

    for (const [path, card] of ctx.fileCards) {
        const x = parseFloat(card.style.left) || 0;
        const y = parseFloat(card.style.top) || 0;
        const w = card.offsetWidth || 580;
        const h = card.offsetHeight || 700;
        const changed = card.dataset.changed === 'true';
        cards.push({ x, y, w, h, path, changed });
    }

    // Include deferred cards
    for (const [path, entry] of ctx.deferredCards) {
        const { x, y, size, isChanged } = entry;
        const w = size?.width || 580;
        const h = size?.height || 700;
        cards.push({ x, y, w, h, path, changed: isChanged || false });
    }

    return cards;
}

function getBoundingRect(cards: { x: number; y: number; w: number; h: number }[]) {
    if (cards.length === 0) return { x: 0, y: 0, w: 800, h: 600 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of cards) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.w);
        maxY = Math.max(maxY, c.y + c.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ─── Render cards to canvas ──────────────────────────────
function renderToCanvas(
    cards: { x: number; y: number; w: number; h: number; path: string; changed: boolean }[],
    bounds: { x: number; y: number; w: number; h: number },
    scale: number,
    repoName: string
): HTMLCanvasElement {
    const padding = 60;
    const headerHeight = 50;
    const canvas = document.createElement('canvas');
    const cw = Math.ceil(bounds.w * scale + padding * 2);
    const ch = Math.ceil(bounds.h * scale + padding * 2 + headerHeight);

    // Limit to reasonable size
    const maxDim = 8192;
    const finalScale = Math.min(scale, maxDim / Math.max(bounds.w, bounds.h));
    canvas.width = Math.min(maxDim, Math.ceil(bounds.w * finalScale + padding * 2));
    canvas.height = Math.min(maxDim, Math.ceil(bounds.h * finalScale + padding * 2 + headerHeight));

    const c = canvas.getContext('2d')!;

    // Background
    c.fillStyle = '#0f0f1a';
    c.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid
    c.strokeStyle = 'rgba(124, 58, 237, 0.04)';
    c.lineWidth = 1;
    const gridSize = 100 * finalScale;
    for (let gx = padding; gx < canvas.width; gx += gridSize) {
        c.beginPath(); c.moveTo(gx, headerHeight); c.lineTo(gx, canvas.height); c.stroke();
    }
    for (let gy = padding + headerHeight; gy < canvas.height; gy += gridSize) {
        c.beginPath(); c.moveTo(0, gy); c.lineTo(canvas.width, gy); c.stroke();
    }

    // Header
    c.fillStyle = 'rgba(0, 0, 0, 0.5)';
    c.fillRect(0, 0, canvas.width, headerHeight);
    c.fillStyle = ACCENT;
    c.font = `bold 16px system-ui, -apple-system, sans-serif`;
    c.fillText('GitMaps', 20, 30);
    c.fillStyle = MUTED_COLOR;
    c.font = `13px system-ui, -apple-system, sans-serif`;
    c.fillText(`${repoName} · ${cards.length} files`, 95, 30);
    // Timestamp
    const now = new Date().toLocaleString();
    const timeW = c.measureText(now).width;
    c.fillText(now, canvas.width - timeW - 20, 30);

    // Draw cards
    for (const card of cards) {
        const cx = (card.x - bounds.x) * finalScale + padding;
        const cy = (card.y - bounds.y) * finalScale + padding + headerHeight;
        const cw = card.w * finalScale;
        const ch = card.h * finalScale;

        // Card shadow
        c.fillStyle = 'rgba(0, 0, 0, 0.3)';
        c.fillRect(cx + 3, cy + 3, cw, ch);

        // Card body
        c.fillStyle = CARD_BG;
        c.fillRect(cx, cy, cw, ch);

        // Card border
        c.strokeStyle = card.changed ? MOD_COLOR + '88' : CARD_BORDER;
        c.lineWidth = card.changed ? 2 : 1;
        c.strokeRect(cx, cy, cw, ch);

        // Header bar
        const hh = Math.min(28 * finalScale, 28);
        c.fillStyle = CARD_HEADER_BG;
        c.fillRect(cx, cy, cw, hh);

        // Language dot
        const langColor = getLangColor(card.path);
        c.fillStyle = langColor;
        c.beginPath();
        c.arc(cx + 10, cy + hh / 2, 4, 0, Math.PI * 2);
        c.fill();

        // File name
        const fileName = card.path.split('/').pop() || card.path;
        const fontSize = Math.max(8, Math.min(12, 12 * finalScale));
        c.fillStyle = TEXT_COLOR;
        c.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
        const maxTextW = cw - 24;
        let displayName = fileName;
        if (c.measureText(displayName).width > maxTextW) {
            while (displayName.length > 3 && c.measureText(displayName + '…').width > maxTextW) {
                displayName = displayName.slice(0, -1);
            }
            displayName += '…';
        }
        c.fillText(displayName, cx + 20, cy + hh / 2 + fontSize / 3);

        // Changed marker
        if (card.changed) {
            c.fillStyle = MOD_COLOR;
            c.beginPath();
            c.arc(cx + cw - 10, cy + hh / 2, 4, 0, Math.PI * 2);
            c.fill();
        }

        // Simulated code lines
        const lineH = Math.max(2, 3 * finalScale);
        const lineGap = Math.max(1, 1.5 * finalScale);
        const startY = cy + hh + 8;
        const endY = cy + ch - 4;
        const lineX = cx + 6;
        c.globalAlpha = 0.15;
        for (let ly = startY; ly < endY; ly += lineH + lineGap) {
            const lineW = (Math.random() * 0.5 + 0.3) * (cw - 16);
            c.fillStyle = TEXT_COLOR;
            c.fillRect(lineX, ly, lineW, lineH);
        }
        c.globalAlpha = 1;

        // Full path (if cards are large enough)
        if (ch > 60) {
            const pathFontSize = Math.max(6, Math.min(9, 9 * finalScale));
            c.fillStyle = MUTED_COLOR;
            c.font = `${pathFontSize}px monospace`;
            const dirPath = card.path.includes('/') ? card.path.substring(0, card.path.lastIndexOf('/')) : '';
            if (dirPath) {
                c.fillText(dirPath + '/', cx + 6, cy + hh + 6 + pathFontSize);
            }
        }
    }

    // Watermark
    c.fillStyle = 'rgba(124, 58, 237, 0.15)';
    c.font = 'bold 11px system-ui';
    c.fillText('Exported from GitMaps', canvas.width - 150, canvas.height - 12);

    return canvas;
}

// ─── Download helper ─────────────────────────────────────
function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
}

// ─── Public API ──────────────────────────────────────────

/** Export the full canvas (all cards) as PNG */
export function exportCanvasAsPNG(ctx: CanvasContext) {
    measure('export:png', () => {
        const cards = getAllCardBounds(ctx);
        if (cards.length === 0) {
            console.warn('[canvas-export] No cards to export');
            return;
        }

        const bounds = getBoundingRect(cards);

        // Auto-scale: fit into ~4000px max dimension
        const maxDim = 4096;
        const scale = Math.min(1, maxDim / Math.max(bounds.w, bounds.h));

        const repoName = (() => {
            const el = document.querySelector('.repo-dropdown-trigger, .repo-name');
            return el?.textContent?.trim() || 'Repository';
        })();

        const canvas = renderToCanvas(cards, bounds, scale, repoName);

        const timestamp = new Date().toISOString().slice(0, 10);
        const safeName = repoName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        downloadCanvas(canvas, `gitmaps-${safeName}-${timestamp}.png`);

        // Show toast
        showExportToast(`Exported ${cards.length} files as PNG`);
    });
}

/** Export just the current viewport as PNG */
export function exportViewportAsPNG(ctx: CanvasContext) {
    measure('export:viewport', () => {
        const gdState = getGalaxyDrawState();
        if (!gdState) return;

        const vpEl = ctx.canvasViewport;
        if (!vpEl) return;

        const vpW = vpEl.clientWidth;
        const vpH = vpEl.clientHeight;
        const zoom = gdState.zoom || 1;
        const offsetX = gdState.offsetX || 0;
        const offsetY = gdState.offsetY || 0;

        // World coordinates of viewport
        const worldLeft = -offsetX / zoom;
        const worldTop = -offsetY / zoom;
        const worldRight = (vpW - offsetX) / zoom;
        const worldBottom = (vpH - offsetY) / zoom;

        const allCards = getAllCardBounds(ctx);
        // Filter to cards visible in viewport
        const visibleCards = allCards.filter(card =>
            card.x + card.w > worldLeft &&
            card.x < worldRight &&
            card.y + card.h > worldTop &&
            card.y < worldBottom
        );

        if (visibleCards.length === 0) {
            showExportToast('No cards visible in viewport');
            return;
        }

        const bounds = {
            x: worldLeft,
            y: worldTop,
            w: worldRight - worldLeft,
            h: worldBottom - worldTop,
        };

        const scale = Math.min(2, vpW / bounds.w); // 2x for retina quality

        const repoName = (() => {
            const el = document.querySelector('.repo-dropdown-trigger, .repo-name');
            return el?.textContent?.trim() || 'Repository';
        })();

        const canvas = renderToCanvas(visibleCards, bounds, scale, repoName);

        const timestamp = new Date().toISOString().slice(0, 10);
        const safeName = repoName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        downloadCanvas(canvas, `gitmaps-viewport-${safeName}-${timestamp}.png`);

        showExportToast(`Exported viewport (${visibleCards.length} files) as PNG`);
    });
}

// ─── Toast notification ──────────────────────────────────
function showExportToast(message: string) {
    const existing = document.getElementById('exportToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'exportToast';
    toast.textContent = `📸 ${message}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 60px;
        left: 50%;
        transform: translateX(-50%) translateY(10px);
        background: rgba(124, 58, 237, 0.9);
        color: #fff;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        z-index: 10001;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 20px rgba(124, 58, 237, 0.3);
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
    `;

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
