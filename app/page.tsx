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

            {/* Landing overlay — visible until a repo is loaded */}
            <div className="landing-overlay" id="landingOverlay">
                <div className="landing-content">
                    <div className="landing-icon">
                        <svg viewBox="0 0 120 120" width="80" height="80" fill="none">
                            <circle cx="60" cy="60" r="54" stroke="url(#lg1)" strokeWidth="2" opacity="0.3" />
                            <circle cx="60" cy="60" r="36" stroke="url(#lg1)" strokeWidth="1.5" opacity="0.2" />
                            <circle cx="60" cy="60" r="6" fill="url(#lg1)" />

                            {/* Orbiting nodes */}
                            <circle cx="60" cy="6" r="4" fill="#a78bfa" opacity="0.8" />
                            <circle cx="106" cy="40" r="3.5" fill="#60a5fa" opacity="0.7" />
                            <circle cx="96" cy="94" r="3" fill="#34d399" opacity="0.7" />
                            <circle cx="24" cy="94" r="3.5" fill="#f472b6" opacity="0.6" />
                            <circle cx="14" cy="40" r="3" fill="#fbbf24" opacity="0.7" />

                            {/* Connection lines to center */}
                            <line x1="60" y1="6" x2="60" y2="54" stroke="#a78bfa" strokeWidth="0.8" opacity="0.25" />
                            <line x1="106" y1="40" x2="66" y2="58" stroke="#60a5fa" strokeWidth="0.8" opacity="0.25" />
                            <line x1="96" y1="94" x2="64" y2="64" stroke="#34d399" strokeWidth="0.8" opacity="0.2" />
                            <line x1="24" y1="94" x2="56" y2="64" stroke="#f472b6" strokeWidth="0.8" opacity="0.2" />
                            <line x1="14" y1="40" x2="54" y2="58" stroke="#fbbf24" strokeWidth="0.8" opacity="0.25" />

                            <defs>
                                <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#a78bfa" />
                                    <stop offset="100%" stopColor="#60a5fa" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>

                    <h1 className="landing-title">Git Canvas</h1>
                    <p className="landing-subtitle">See your code in a new dimension</p>

                    <div className="landing-concepts">
                        <div className="concept-card">
                            <div className="concept-icon">📐</div>
                            <h3>Spatial Code Review</h3>
                            <p>Every changed file becomes a card on an infinite 2D canvas. Arrange, group, and navigate them spatially — not as a flat list.</p>
                        </div>
                        <div className="concept-card">
                            <div className="concept-icon">🔗</div>
                            <h3>Interwingled Files</h3>
                            <p>Draw connections between related lines across files. See how <code>auth.ts:42</code> relates to <code>middleware.ts:15</code> — visually.</p>
                        </div>
                        <div className="concept-card">
                            <div className="concept-icon">📑</div>
                            <h3>Layers of Focus</h3>
                            <p>Create layers to isolate subsets of files. "Auth layer" shows only auth-related changes. Switch context without losing position.</p>
                        </div>
                    </div>

                    <div className="landing-cta">
                        <span className="landing-hint">Select a repository from the sidebar to begin</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
