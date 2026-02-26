// @ts-nocheck
/**
 * Loading progress overlay.
 * Uses melina/client JSX + render.
 */
import { render } from 'melina/client';
import type { CanvasContext } from './context';

function LoadingOverlayContent({ message, sub }: { message: string; sub: string }) {
    return (
        <div className="loading-content">
            <div className="loading-spinner"></div>
            <div className="loading-message">{message}</div>
            <div className="loading-sub">{sub}</div>
        </div>
    );
}

let currentMessage = '';
let currentSub = '';

export function showLoadingProgress(ctx: CanvasContext, message: string) {
    if (!ctx.loadingOverlay) {
        ctx.loadingOverlay = document.createElement('div');
        ctx.loadingOverlay.className = 'loading-overlay';
        document.body.appendChild(ctx.loadingOverlay);
    }
    currentMessage = message;
    currentSub = '';
    render(<LoadingOverlayContent message={currentMessage} sub={currentSub} />, ctx.loadingOverlay);
    ctx.loadingOverlay.classList.add('active');
}

export function updateLoadingProgress(ctx: CanvasContext, sub: string) {
    if (ctx.loadingOverlay) {
        currentSub = sub;
        render(<LoadingOverlayContent message={currentMessage} sub={currentSub} />, ctx.loadingOverlay);
    }
}

export function hideLoadingProgress(ctx: CanvasContext) {
    if (ctx.loadingOverlay) {
        ctx.loadingOverlay.classList.remove('active');
    }
}
