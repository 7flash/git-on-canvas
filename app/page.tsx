/**
 * Home Page — JSX server component
 *
 * Returns the canvas viewport as JSX.
 * Client interactivity is mounted by page.client.tsx.
 */

export default function Page() {
    const featuredRepos = [
        { name: 'facebook/react', desc: 'UI Library', lang: 'JavaScript', stars: '230k' },
        { name: 'denoland/deno', desc: 'JS Runtime', lang: 'TypeScript', stars: '100k' },
        { name: 'sveltejs/svelte', desc: 'Compiler Framework', lang: 'TypeScript', stars: '80k' },
        { name: 'oven-sh/bun', desc: 'JS Toolkit', lang: 'Zig', stars: '75k' },
        { name: 'vercel/next.js', desc: 'React Framework', lang: 'TypeScript', stars: '127k' },
        { name: 'tailwindlabs/tailwindcss', desc: 'CSS Framework', lang: 'TypeScript', stars: '85k' },
    ];

    const langColors: Record<string, string> = {
        JavaScript: '#f1e05a',
        TypeScript: '#3178c6',
        Zig: '#ec915c',
    };

    return (
        <div className="canvas-viewport" id="canvasViewport">
            <div className="canvas-content" id="canvasContent">
                <svg className="connections-overlay" id="connectionsOverlay"></svg>
            </div>

            {/* Landing overlay — visible until a repo is loaded */}
            <div className="landing-overlay" id="landingOverlay">
                {/* Animated grid canvas background */}
                <div className="landing-grid-bg">
                    <div className="grid-line gl-h1"></div>
                    <div className="grid-line gl-h2"></div>
                    <div className="grid-line gl-h3"></div>
                    <div className="grid-line gl-v1"></div>
                    <div className="grid-line gl-v2"></div>
                    <div className="grid-line gl-v3"></div>
                </div>

                {/* Animated background particles */}
                <div className="landing-bg-particles" id="landingParticles">
                    <div className="particle p1"></div>
                    <div className="particle p2"></div>
                    <div className="particle p3"></div>
                    <div className="particle p4"></div>
                    <div className="particle p5"></div>
                    <div className="particle p6"></div>
                    <div className="particle p7"></div>
                    <div className="particle p8"></div>
                </div>
                {/* Gradient mesh background */}
                <div className="landing-mesh"></div>

                <div className="landing-content">
                    {/* Hero Section */}
                    <div className="landing-hero">
                        <div className="landing-badge">
                            <span className="badge-dot"></span>
                            Open Source · Spatial Code Explorer
                        </div>

                        <div className="landing-icon">
                            <svg viewBox="0 0 140 140" width="100" height="100" fill="none">
                                {/* Outer ring with dash animation */}
                                <circle cx="70" cy="70" r="64" stroke="url(#lgHero)" strokeWidth="1.5" opacity="0.2" strokeDasharray="6 8" className="ring-outer" />
                                <circle cx="70" cy="70" r="48" stroke="url(#lgHero)" strokeWidth="1.2" opacity="0.15" strokeDasharray="4 6" className="ring-mid" />
                                <circle cx="70" cy="70" r="30" stroke="url(#lgHero)" strokeWidth="1" opacity="0.1" />

                                {/* Center glow core */}
                                <circle cx="70" cy="70" r="8" fill="url(#lgHero)" opacity="0.9" className="core-glow" />
                                <circle cx="70" cy="70" r="4" fill="#fff" opacity="0.8" />

                                {/* Orbiting nodes with connection lines */}
                                <g className="orbit-group">
                                    <line x1="70" y1="6" x2="70" y2="62" stroke="#a78bfa" strokeWidth="0.6" opacity="0.2" />
                                    <circle cx="70" cy="6" r="5" fill="#a78bfa" opacity="0.85" className="node-orbit n1" />
                                    <circle cx="70" cy="6" r="2" fill="#fff" opacity="0.6" />

                                    <line x1="126" y1="46" x2="76" y2="68" stroke="#60a5fa" strokeWidth="0.6" opacity="0.2" />
                                    <circle cx="126" cy="46" r="4.5" fill="#60a5fa" opacity="0.8" className="node-orbit n2" />
                                    <circle cx="126" cy="46" r="1.8" fill="#fff" opacity="0.5" />

                                    <line x1="112" y1="110" x2="74" y2="74" stroke="#34d399" strokeWidth="0.6" opacity="0.18" />
                                    <circle cx="112" cy="110" r="4" fill="#34d399" opacity="0.75" className="node-orbit n3" />

                                    <line x1="28" y1="110" x2="66" y2="74" stroke="#f472b6" strokeWidth="0.6" opacity="0.18" />
                                    <circle cx="28" cy="110" r="4" fill="#f472b6" opacity="0.65" className="node-orbit n4" />

                                    <line x1="14" y1="46" x2="64" y2="68" stroke="#fbbf24" strokeWidth="0.6" opacity="0.2" />
                                    <circle cx="14" cy="46" r="3.5" fill="#fbbf24" opacity="0.7" className="node-orbit n5" />

                                    {/* Extra subtle node */}
                                    <circle cx="98" cy="20" r="2.5" fill="#818cf8" opacity="0.4" className="node-orbit n6" />
                                    <circle cx="42" cy="20" r="2" fill="#c084fc" opacity="0.35" />
                                </g>

                                <defs>
                                    <linearGradient id="lgHero" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#a78bfa" />
                                        <stop offset="50%" stopColor="#60a5fa" />
                                        <stop offset="100%" stopColor="#34d399" />
                                    </linearGradient>
                                    <radialGradient id="rgCore">
                                        <stop offset="0%" stopColor="#c4b5fd" />
                                        <stop offset="100%" stopColor="#7c3aed" />
                                    </radialGradient>
                                </defs>
                            </svg>
                        </div>

                        <h1 className="landing-title">
                            <span className="title-git">Git</span>
                            <span className="title-maps">Maps</span>
                        </h1>
                        <p className="landing-subtitle">
                            See your codebase in a new dimension.<br />
                            <span className="subtitle-accent">Every file becomes a card. Every change tells a story.</span>
                        </p>
                    </div>

                    {/* Feature Cards */}
                    <div className="landing-features">
                        <div className="feature-card fc-1">
                            <div className="feature-glow"></div>
                            <div className="feature-icon-wrap">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="7" height="7" rx="1" />
                                    <rect x="14" y="3" width="7" height="7" rx="1" />
                                    <rect x="3" y="14" width="7" height="7" rx="1" />
                                    <rect x="14" y="14" width="7" height="7" rx="1" />
                                </svg>
                            </div>
                            <h3>Spatial Code Review</h3>
                            <p>Every file becomes a card on an infinite 2D canvas. Arrange, group, and navigate them spatially — not as a flat list.</p>
                        </div>

                        <div className="feature-card fc-2">
                            <div className="feature-glow"></div>
                            <div className="feature-icon-wrap">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="6" cy="6" r="3" />
                                    <circle cx="18" cy="18" r="3" />
                                    <path d="M8.59 13.51l6.83 6.83" />
                                    <line x1="21" y1="3" x2="14" y2="10" />
                                    <polyline points="21 10 21 3 14 3" />
                                </svg>
                            </div>
                            <h3>Interwingled Files</h3>
                            <p>Draw connections between related lines across files. See how <code>auth.ts:42</code> relates to <code>middleware.ts:15</code> — visually.</p>
                        </div>

                        <div className="feature-card fc-3">
                            <div className="feature-glow"></div>
                            <div className="feature-icon-wrap">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                                    <line x1="12" y1="22" x2="12" y2="15.5" />
                                    <polyline points="22 8.5 12 15.5 2 8.5" />
                                    <polyline points="2 15.5 12 8.5 22 15.5" />
                                    <line x1="12" y1="2" x2="12" y2="8.5" />
                                </svg>
                            </div>
                            <h3>Layers of Focus</h3>
                            <p>Create layers to isolate subsets of files. "Auth layer" shows only auth-related changes. Switch context without losing position.</p>
                        </div>

                        <div className="feature-card fc-4">
                            <div className="feature-glow"></div>
                            <div className="feature-icon-wrap">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                                    <polyline points="7.5 19.79 7.5 14.6 3 12" />
                                    <polyline points="21 12 16.5 14.6 16.5 19.79" />
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                    <line x1="12" y1="22.08" x2="12" y2="12" />
                                </svg>
                            </div>
                            <h3>Clone & Explore</h3>
                            <p>Paste any GitHub URL and explore it instantly. Real-time clone progress, smart caching, and full commit timeline navigation.</p>
                        </div>
                    </div>

                    {/* Featured Repos — Quick start */}
                    <div className="landing-repos">
                        <div className="repos-header">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                                <path d="M9 18c-4.51 2-5-2-7-2" />
                            </svg>
                            <span>Explore popular repositories</span>
                        </div>
                        <div className="repos-grid">
                            {featuredRepos.map((repo) => (
                                <button
                                    key={repo.name}
                                    className="repo-card-btn"
                                    data-repo={`https://github.com/${repo.name}`}
                                    id={`landing-repo-${repo.name.replace('/', '-')}`}
                                >
                                    <div className="repo-card-name">{repo.name.split('/')[1]}</div>
                                    <div className="repo-card-org">{repo.name.split('/')[0]}</div>
                                    <div className="repo-card-meta">
                                        <span className="repo-card-lang">
                                            <span className="lang-dot" style={{ background: langColors[repo.lang] || '#888' }}></span>
                                            {repo.lang}
                                        </span>
                                        <span className="repo-card-stars">★ {repo.stars}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Call to Action */}
                    <div className="landing-cta">
                        <div className="cta-arrows">
                            <span className="cta-arrow a1">←</span>
                            <span className="cta-text">Select a repository from the sidebar to begin</span>
                        </div>
                        <div className="cta-or">or paste a GitHub URL in the clone input above</div>
                    </div>

                    {/* Stats Row */}
                    <div className="landing-stats">
                        <div className="landing-stat">
                            <span className="stat-num">∞</span>
                            <span className="stat-desc">Infinite Canvas</span>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="landing-stat">
                            <span className="stat-num">0ms</span>
                            <span className="stat-desc">Local-First</span>
                        </div>
                        <div className="stat-divider"></div>
                        <div className="landing-stat">
                            <span className="stat-num">OSS</span>
                            <span className="stat-desc">Open Source</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
