// @ts-nocheck
/**
 * page.client.tsx — Slim orchestrator
 *
 * Creates the XState actor, initialises all sub-modules, and returns a
 * cleanup function.  All heavy logic lives in `./lib/*`.
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
    const actor = createActor(canvasMachine);
    const ctx = createCanvasContext(actor);

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
            loadHiddenFiles(ctx);
            updateHiddenUI(ctx);
            await loadConnections(ctx);

            // Check URL hash for repo path
            const hashRepo = decodeURIComponent(window.location.hash.replace('#', ''));
            if (hashRepo) {
                (document.getElementById('repoPath') as HTMLInputElement).value = hashRepo;
                loadRepository(ctx, hashRepo);
            } else {
                const saved = localStorage.getItem('gitcanvas:lastRepo');
                if (saved) {
                    (document.getElementById('repoPath') as HTMLInputElement).value = saved;
                }
            }

            // Listen for hash changes
            window.addEventListener('hashchange', () => {
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
    return () => {
        actor.stop();
        clearCanvas(ctx);
    };
}
