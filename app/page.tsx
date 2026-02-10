/**
 * Home Page — String-based server component (no React)
 *
 * Returns the canvas viewport as raw HTML.
 * Client interactivity is mounted by page.client.tsx.
 */

export default function Page() {
    return `<div class="canvas-viewport" id="canvasViewport">
        <div class="canvas-content" id="canvasContent">
            <svg class="connections-overlay" id="connectionsOverlay"></svg>
        </div>
    </div>`;
}
