/**
 * Home Page — Server Component
 *
 * Renders the canvas viewport. The canvas interaction
 * (pan, zoom, cards, connections) is handled by page.client.tsx.
 */
import React from 'react';

export default function HomePage() {
    return (
        <div className="canvas-viewport" id="canvasViewport">
            <div className="canvas" id="canvas">
                <div className="canvas-grid" />
            </div>
        </div>
    );
}
