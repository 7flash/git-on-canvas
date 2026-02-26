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
import { clearCanvas, updateCanvasTransform, updateZoomUI } from './lib/canvas';
import { loadRepository } from './lib/repo';

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
            if (!ctx.svgOverlay) {
                // Fallback: create overlay if not present
                ctx.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
                ctx.svgOverlay.id = 'connectionsOverlay';
                ctx.svgOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;overflow:visible;';
                ctx.canvas.appendChild(ctx.svgOverlay);
            }

            actor.start();
            setupCanvasInteraction(ctx);
            setupEventListeners(ctx);
            await loadSavedPositions(ctx);
            if (disposed) return; // bail if cleaned up during await
            loadHiddenFiles(ctx);
            updateHiddenUI(ctx);
            await loadConnections(ctx);
            if (disposed) return; // bail if cleaned up during await

            // Check URL hash for repo path
            const hashRepo = decodeURIComponent(window.location.hash.replace('#', ''));
            if (hashRepo) {
                (document.getElementById('repoPath') as HTMLInputElement).value = hashRepo;
                if (!disposed) loadRepository(ctx, hashRepo);
            } else {
                const saved = localStorage.getItem('gitcanvas:lastRepo');
                if (saved) {
                    (document.getElementById('repoPath') as HTMLInputElement).value = saved;
                }
            }

            // Listen for hash changes
            window.addEventListener('hashchange', () => {
                if (disposed) return;
                const path = decodeURIComponent(window.location.hash.replace('#', ''));
                if (path && path !== ctx.snap().context.repoPath) {
                    (document.getElementById('repoPath') as HTMLInputElement).value = path;
                    loadRepository(ctx, path);
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
        clearCanvas(ctx);
    };
    (window as any).__gitcanvas_cleanup__ = cleanup;
    return cleanup;
}
