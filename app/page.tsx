/**
 * Home Page — JSX server component
 *
 * Returns the canvas viewport as JSX.
 * Client interactivity is mounted by page.client.tsx.
 */

export default function Page() {
    return (
        <div className="canvas-viewport" id="canvasViewport">
            <div className="canvas-content" id="canvasContent">
                <svg className="connections-overlay" id="connectionsOverlay"></svg>
            </div>
        </div>
    );
}
