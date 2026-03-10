// @ts-nocheck
/**
 * page.client.tsx — Slim orchestrator
 *
 * Creates the XState actor, initialises all sub-modules, and returns a
 * cleanup function.  All heavy logic lives in `./lib/*`.
 * 
 * Uses an AbortController to cancel in-flight async work when cleanup runs,
 * preventing the "stopped actor" race condition.
 */
import { measure } from 'measure-fn';
import { createActor } from 'xstate';
import { canvasMachine } from './state/machine.js';
import { createCanvasContext } from './lib/context';
import { loadSavedPositions } from './lib/positions';
import { loadHiddenFiles, updateHiddenUI } from './lib/hidden-files';
import { setupCanvasInteraction, setupEventListeners } from './lib/events';
import { loadConnections } from './lib/connections';
import { clearCanvas, updateCanvasTransform, updateZoomUI, restoreViewport } from './lib/canvas';
import { setupPillInteraction } from './lib/viewport-culling';
import { loadRepository } from './lib/repo';
import { initLayers, renderLayersUI } from './lib/layers';
import { setupAuth, updateFavoriteStar } from './lib/user';
import { setupPerfOverlay } from './lib/perf-overlay';
import { initGalaxyDrawState, initCardManager } from './lib/galaxydraw-bridge';
import { initFilePreview, destroyFilePreview } from './lib/file-preview';
import { initBranchCompare } from './lib/branch-compare';
import { initCommandPalette } from './lib/command-palette';
import { initShortcutsPanel } from './lib/shortcuts-panel';
import { initStatusBar } from './lib/status-bar';

export default function mount(): () => void {
    // Stop any previous actor from a prior mount
    if ((window as any).__gitcanvas_cleanup__) {
        try { (window as any).__gitcanvas_cleanup__(); } catch (_) { }
    }

    const actor = createActor(canvasMachine);
    const ctx = createCanvasContext(actor);
    let disposed = false;

    // ─── Init ────────────────────────────────────────────
    async function init() {
        return measure('app:init', async () => {
            ctx.canvas = document.getElementById('canvasContent');
            ctx.canvasViewport = document.getElementById('canvasViewport');

            // Reuse existing SVG overlay from server-rendered DOM
            ctx.svgOverlay = document.getElementById('connectionsOverlay') as unknown as SVGSVGElement;
            if (!ctx.svgOverlay && ctx.canvas) {
                // Fallback: create overlay if not present
                ctx.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
                ctx.svgOverlay.id = 'connectionsOverlay';
                ctx.svgOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible;';
                ctx.canvas.appendChild(ctx.svgOverlay);
            }

            // Init galaxydraw state engine (binds to existing DOM)
            initGalaxyDrawState(ctx);

            // Init galaxydraw card manager (Phase 4 — registers file + diff plugins)
            initCardManager(ctx);

            actor.start();
            setupCanvasInteraction(ctx);
            setupEventListeners(ctx);
            setupPillInteraction(ctx);
            setupPerfOverlay(ctx);
            if (ctx.canvasViewport) initFilePreview(ctx.canvasViewport, ctx);
            initBranchCompare(ctx);
            initCommandPalette(ctx);
            initShortcutsPanel();
            initStatusBar(ctx);
            await loadSavedPositions(ctx); // initial load (may be empty if no repo yet)
            if (disposed) return; // bail if cleaned up during await
            loadHiddenFiles(ctx);
            updateHiddenUI(ctx);
            await loadConnections(ctx);
            if (disposed) return; // bail if cleaned up during await

            // Init auth UI
            setupAuth();

            // ── Shared Layout Decoder ──────────────────────────────────────────
            const applySharedLayout = async (ctx: CanvasContext) => {
                const urlParams = new URLSearchParams(window.location.search);
                const sharedLayout = urlParams.get('layout');
                if (!sharedLayout) return;

                try {
                    const parsed = JSON.parse(atob(sharedLayout));
                    if (parsed.positions) {
                        ctx.positions = new Map(Object.entries(parsed.positions));
                        const { savePosition } = await import('./lib/positions');
                        // Quick dummy save to trigger debounced persistence
                        savePosition(ctx, '_share_', '_trigger_', 0, 0);
                    }
                    if (parsed.hiddenFiles) {
                        ctx.hiddenFiles = new Set(parsed.hiddenFiles);
                        const { saveHiddenFiles } = await import('./lib/hidden-files');
                        saveHiddenFiles(ctx);
                        updateHiddenUI(ctx);
                    }
                    if (parsed.zoom !== undefined) ctx.actor.send({ type: 'SET_ZOOM', zoom: parsed.zoom });
                    if (parsed.offsetX !== undefined) ctx.actor.send({ type: 'SET_OFFSET', x: parsed.offsetX, y: parsed.offsetY });
                    if (parsed.cardSizes) {
                        for (const [path, size] of Object.entries(parsed.cardSizes)) {
                            ctx.actor.send({ type: 'RESIZE_CARD', path, width: (size as any).width, height: (size as any).height });
                        }
                    }

                    const cleanUrl = new URL(window.location.href);
                    cleanUrl.searchParams.delete('layout');
                    window.history.replaceState({}, '', cleanUrl.toString());
                    const { showToast } = await import('./lib/utils');
                    showToast('Shared layout applied!', 'success');
                } catch (e) {
                    console.error('Failed to decode shared layout', e);
                }
            };

            // Check URL hash for repo slug (or legacy full path)
            const hashValue = decodeURIComponent(window.location.hash.replace('#', ''));
            if (hashValue) {
                // Resolve slug to full path (check localStorage mapping)
                const resolvedPath = localStorage.getItem(`gitcanvas:slug:${hashValue}`) || hashValue;

                // Hide landing immediately since we have a repo
                const landing = document.getElementById('landingOverlay');
                if (landing) landing.style.display = 'none';

                const sel = document.getElementById('repoSelect') as HTMLSelectElement;
                if (sel) sel.value = resolvedPath;

                // Init layers based on repo
                ctx.actor.send({ type: 'LOAD_REPO', path: resolvedPath });
                ctx.snap().context.repoPath = resolvedPath;
                await loadSavedPositions(ctx); // reload positions for this repo
                if (disposed) return;
                await applySharedLayout(ctx);
                initLayers(ctx);
                renderLayersUI(ctx);
                restoreViewport(ctx);
                updateCanvasTransform(ctx);
                updateZoomUI(ctx);

                if (!disposed) {
                    import('./lib/pr-review').then(({ initReviewStore }) => {
                        initReviewStore(hashValue);
                    });
                    loadRepository(ctx, resolvedPath);
                    updateFavoriteStar(resolvedPath);
                }
            } else {
                const saved = localStorage.getItem('gitcanvas:lastRepo');
                if (saved) {
                    const sel2 = document.getElementById('repoSelect') as HTMLSelectElement;
                    if (sel2) sel2.value = saved;

                    // Set URL hash to friendly slug instead of full path
                    const savedSlug = saved.replace(/\\/g, '/').split('/').filter(Boolean).pop() || saved;
                    history.replaceState(null, '', '#' + encodeURIComponent(savedSlug));
                    // Store slug→path mapping
                    localStorage.setItem(`gitcanvas:slug:${savedSlug}`, saved);

                    ctx.actor.send({ type: 'LOAD_REPO', path: saved });
                    ctx.snap().context.repoPath = saved;
                    await loadSavedPositions(ctx);
                    if (disposed) return;
                    await applySharedLayout(ctx);
                    initLayers(ctx);
                    renderLayersUI(ctx);
                    restoreViewport(ctx);
                    updateCanvasTransform(ctx);
                    updateZoomUI(ctx);

                    // Actually load the repo data
                    if (!disposed) {
                        import('./lib/pr-review').then(({ initReviewStore }) => {
                            initReviewStore(savedSlug);
                        });
                        loadRepository(ctx, saved);
                    }
                }
            }

            // Listen for hash changes
            window.addEventListener('hashchange', () => {
                if (disposed) return;
                const hashSlug = decodeURIComponent(window.location.hash.replace('#', ''));
                const resolvedPath = localStorage.getItem(`gitcanvas:slug:${hashSlug}`) || hashSlug;
                if (resolvedPath && resolvedPath !== ctx.snap().context.repoPath) {
                    const sel3 = document.getElementById('repoSelect') as HTMLSelectElement;
                    if (sel3) sel3.value = resolvedPath;
                    loadRepository(ctx, resolvedPath);
                    updateFavoriteStar(resolvedPath);
                }
            });
        });
    }

    // ─── Boot ────────────────────────────────────────────
    init();

    // ─── Cleanup ─────────────────────────────────────────
    const cleanup = () => {
        disposed = true;
        (window as any).__gitcanvas_cleanup__ = null;
        try { actor.stop(); } catch (_) { }
        if (ctx.canvasViewport) destroyFilePreview(ctx.canvasViewport);
        clearCanvas(ctx);
    };
    (window as any).__gitcanvas_cleanup__ = cleanup;
    return cleanup;
}
