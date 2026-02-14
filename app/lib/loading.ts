// @ts-nocheck
/**
 * Loading progress overlay.
 */
import type { CanvasContext } from './context';

export function showLoadingProgress(ctx: CanvasContext, message: string) {
    if (!ctx.loadingOverlay) {
        ctx.loadingOverlay = document.createElement('div');
        ctx.loadingOverlay.className = 'loading-overlay';
        ctx.loadingOverlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-message"></div>
                <div class="loading-sub"></div>
            </div>
        `;
        document.body.appendChild(ctx.loadingOverlay);
    }
    ctx.loadingOverlay.querySelector('.loading-message').textContent = message;
    ctx.loadingOverlay.querySelector('.loading-sub').textContent = '';
    ctx.loadingOverlay.classList.add('active');
}

export function updateLoadingProgress(ctx: CanvasContext, sub: string) {
    if (ctx.loadingOverlay) {
        ctx.loadingOverlay.querySelector('.loading-sub').textContent = sub;
    }
}

export function hideLoadingProgress(ctx: CanvasContext) {
    if (ctx.loadingOverlay) {
        ctx.loadingOverlay.classList.remove('active');
    }
}
