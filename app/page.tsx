/**
 * Home Page — JSX server component
 *
 * Returns the canvas viewport as JSX.
 * Client interactivity is mounted by page.client.tsx.
 */

const FEATURED_REPOS_FALLBACK = [
    { name: 'facebook/react', desc: 'UI Library', lang: 'JavaScript', stars: '230k' },
    { name: 'denoland/deno', desc: 'JS Runtime', lang: 'TypeScript', stars: '100k' },
    { name: 'sveltejs/svelte', desc: 'Compiler Framework', lang: 'TypeScript', stars: '80k' },
    { name: 'oven-sh/bun', desc: 'JS Toolkit', lang: 'Zig', stars: '75k' },
    { name: 'vercel/next.js', desc: 'React Framework', lang: 'TypeScript', stars: '127k' },
    { name: 'tailwindlabs/tailwindcss', desc: 'CSS Framework', lang: 'TypeScript', stars: '85k' },
];

// Cache GitHub stats for 5 minutes
let _cachedRepos: typeof FEATURED_REPOS_FALLBACK | null = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

function formatStars(n: number): string {
    return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

async function getFeaturedRepos() {
    if (_cachedRepos && Date.now() - _cacheTime < CACHE_TTL) return _cachedRepos;
    try {
        const results = await Promise.all(
            FEATURED_REPOS_FALLBACK.map(async (r) => {
                const resp = await fetch(`https://api.github.com/repos/${r.name}`, {
                    headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'GitMaps' },
                    signal: AbortSignal.timeout(3000),
                });
                if (!resp.ok) return r;
                const data = await resp.json();
                return {
                    name: r.name,
                    desc: r.desc,
                    lang: data.language || r.lang,
                    stars: formatStars(data.stargazers_count || 0),
                };
            })
        );
        _cachedRepos = results;
        _cacheTime = Date.now();
        return results;
    } catch {
        return _cachedRepos || FEATURED_REPOS_FALLBACK;
    }
}

export default function Page() {
    const featuredRepos = _cachedRepos || FEATURED_REPOS_FALLBACK;
    getFeaturedRepos().catch(() => { });

    const langColors: Record<string, string> = {
        JavaScript: '#f1e05a',
        TypeScript: '#3178c6',
        Zig: '#ec915c',
        Rust: '#dea584',
        Go: '#00ADD8',
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
                                <circle cx="70" cy="70" r="64" stroke="url(#lgHero)" strokeWidth="1.5" opacity="0.2" strokeDasharray="6 8" className="ring-outer" />
                                <circle cx="70" cy="70" r="48" stroke="url(#lgHero)" strokeWidth="1.2" opacity="0.15" strokeDasharray="4 6" className="ring-mid" />
                                <circle cx="70" cy="70" r="30" stroke="url(#lgHero)" strokeWidth="1" opacity="0.1" />
                                <circle cx="70" cy="70" r="8" fill="url(#lgHero)" opacity="0.9" className="core-glow" />
                                <circle cx="70" cy="70" r="4" fill="#fff" opacity="0.8" />
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
                            Transcend the file tree. See your codebase in four dimensions.<br />
                            <span className="subtitle-accent">Built for reviewing AI-generated code at scale.</span>
                        </p>
                    </div>

                    {/* ─── The 4D Story ─── */}
                    <div className="landing-dimensions">
                        <div className="dimension-label">How GitMaps transcends hierarchical file systems</div>

                        {/* 1D → Files */}
                        <div className="dimension-card dim-1d">
                            <div className="dim-badge">
                                <span className="dim-num">1D</span>
                                <span className="dim-axis">Lines</span>
                            </div>
                            <div className="dim-visual">
                                <svg viewBox="0 0 200 60" fill="none" className="dim-svg">
                                    <line x1="20" y1="20" x2="180" y2="20" stroke="#a78bfa" strokeWidth="2" opacity="0.6" />
                                    <line x1="20" y1="30" x2="140" y2="30" stroke="#a78bfa" strokeWidth="2" opacity="0.4" />
                                    <line x1="20" y1="40" x2="160" y2="40" stroke="#a78bfa" strokeWidth="2" opacity="0.3" />
                                    <text x="10" y="17" fill="#6e7681" fontSize="8" fontFamily="monospace">1</text>
                                    <text x="10" y="27" fill="#6e7681" fontSize="8" fontFamily="monospace">2</text>
                                    <text x="10" y="37" fill="#6e7681" fontSize="8" fontFamily="monospace">3</text>
                                    <rect x="25" y="16" width="50" height="7" rx="1" fill="#2ea043" opacity="0.3" />
                                </svg>
                            </div>
                            <h3>Files are one-dimensional</h3>
                            <p>Lines of code, read top to bottom. The atomic unit. Every file is fully rendered as a card you can read, edit, and scroll.</p>
                        </div>

                        {/* 2D → Canvas */}
                        <div className="dimension-card dim-2d">
                            <div className="dim-badge">
                                <span className="dim-num">2D</span>
                                <span className="dim-axis">Canvas</span>
                            </div>
                            <div className="dim-visual">
                                <svg viewBox="0 0 200 80" fill="none" className="dim-svg">
                                    {/* File cards on canvas */}
                                    <rect x="10" y="10" width="50" height="30" rx="4" fill="#1a1a2e" stroke="#a78bfa" strokeWidth="1" opacity="0.8" />
                                    <text x="18" y="28" fill="#a78bfa" fontSize="7" fontFamily="monospace">auth.ts</text>
                                    <rect x="75" y="5" width="50" height="30" rx="4" fill="#1a1a2e" stroke="#60a5fa" strokeWidth="1" opacity="0.8" />
                                    <text x="80" y="23" fill="#60a5fa" fontSize="7" fontFamily="monospace">api.ts</text>
                                    <rect x="140" y="15" width="50" height="30" rx="4" fill="#1a1a2e" stroke="#34d399" strokeWidth="1" opacity="0.8" />
                                    <text x="145" y="33" fill="#34d399" fontSize="7" fontFamily="monospace">db.ts</text>
                                    <rect x="40" y="48" width="50" height="30" rx="4" fill="#1a1a2e" stroke="#f472b6" strokeWidth="1" opacity="0.8" />
                                    <text x="45" y="66" fill="#f472b6" fontSize="7" fontFamily="monospace">utils.ts</text>
                                    <rect x="110" y="50" width="50" height="30" rx="4" fill="#1a1a2e" stroke="#fbbf24" strokeWidth="1" opacity="0.8" />
                                    <text x="115" y="68" fill="#fbbf24" fontSize="7" fontFamily="monospace">types.ts</text>
                                    {/* Movement arrows */}
                                    <path d="M35 42 L35 48" stroke="#a78bfa" strokeWidth="0.8" opacity="0.4" strokeDasharray="2 2" />
                                    <path d="M100 37 L100 50" stroke="#60a5fa" strokeWidth="0.8" opacity="0.4" strokeDasharray="2 2" />
                                </svg>
                            </div>
                            <h3>Canvas breaks hierarchy</h3>
                            <p>Files escape their folders. Arrange them spatially — group related code side by side regardless of directory structure. This is <em>transclusion</em>: all files rendered on the same surface.</p>
                        </div>

                        {/* 3D → Layers */}
                        <div className="dimension-card dim-3d">
                            <div className="dim-badge">
                                <span className="dim-num">3D</span>
                                <span className="dim-axis">Layers</span>
                            </div>
                            <div className="dim-visual">
                                <svg viewBox="0 0 200 90" fill="none" className="dim-svg">
                                    {/* Stacked layers with perspective */}
                                    <g opacity="0.3">
                                        <rect x="30" y="10" width="140" height="25" rx="3" fill="#1a1a2e" stroke="#6e7681" strokeWidth="0.8" />
                                        <text x="70" y="25" fill="#6e7681" fontSize="8" fontFamily="monospace">All files</text>
                                    </g>
                                    <g opacity="0.5">
                                        <rect x="40" y="30" width="130" height="25" rx="3" fill="#1a1a2e" stroke="#60a5fa" strokeWidth="1" />
                                        <text x="62" y="45" fill="#60a5fa" fontSize="8" fontFamily="monospace">Auth layer</text>
                                    </g>
                                    <g opacity="0.9">
                                        <rect x="50" y="50" width="120" height="25" rx="3" fill="#1a1a2e" stroke="#a78bfa" strokeWidth="1.2" />
                                        <text x="62" y="65" fill="#a78bfa" fontSize="8" fontFamily="monospace">API layer</text>
                                        <circle cx="165" cy="62" r="3" fill="#a78bfa" opacity="0.6" />
                                    </g>
                                    {/* Z-axis arrow */}
                                    <line x1="20" y1="15" x2="20" y2="70" stroke="#c084fc" strokeWidth="1" opacity="0.4" />
                                    <polygon points="20,72 17,68 23,68" fill="#c084fc" opacity="0.4" />
                                    <text x="8" y="44" fill="#c084fc" fontSize="7" fontFamily="monospace" opacity="0.5" transform="rotate(-90, 12, 44)">Z</text>
                                </svg>
                            </div>
                            <h3>Layers add depth</h3>
                            <p>Extract files into focus layers — independently from their folder. Auth, API, UI — each layer is a different plane in 3D space. Switch context without losing position.</p>
                        </div>

                        {/* Connections → navigate 3D */}
                        <div className="dimension-card dim-conn">
                            <div className="dim-badge">
                                <span className="dim-num">⟁</span>
                                <span className="dim-axis">Knots</span>
                            </div>
                            <div className="dim-visual">
                                <svg viewBox="0 0 200 80" fill="none" className="dim-svg">
                                    {/* Two layers with a connection dot between them */}
                                    <rect x="15" y="10" width="70" height="25" rx="3" fill="#1a1a2e" stroke="#60a5fa" strokeWidth="1" opacity="0.7" />
                                    <text x="22" y="25" fill="#60a5fa" fontSize="7" fontFamily="monospace">auth.ts:42</text>
                                    <rect x="115" y="45" width="70" height="25" rx="3" fill="#1a1a2e" stroke="#34d399" strokeWidth="1" opacity="0.7" />
                                    <text x="120" y="60" fill="#34d399" fontSize="7" fontFamily="monospace">api.ts:15</text>
                                    {/* Connection knot */}
                                    <circle cx="100" cy="38" r="6" fill="#a78bfa" opacity="0.2" className="conn-pulse" />
                                    <circle cx="100" cy="38" r="3" fill="#a78bfa" opacity="0.8" />
                                    {/* Lines from dot to endpoints */}
                                    <line x1="82" y1="27" x2="97" y2="35" stroke="#a78bfa" strokeWidth="1" opacity="0.4" strokeDasharray="3 2" />
                                    <line x1="103" y1="41" x2="118" y2="50" stroke="#a78bfa" strokeWidth="1" opacity="0.4" strokeDasharray="3 2" />
                                </svg>
                            </div>
                            <h3>Connections tie it together</h3>
                            <p>Knots that bind files across layers. A connection is a line through 3D space — hover the dot to see the related code. Navigate through the z-axis with a single click.</p>
                        </div>

                        {/* 4D → Time */}
                        <div className="dimension-card dim-4d">
                            <div className="dim-badge">
                                <span className="dim-num">4D</span>
                                <span className="dim-axis">Time</span>
                            </div>
                            <div className="dim-visual">
                                <svg viewBox="0 0 200 60" fill="none" className="dim-svg">
                                    {/* Git timeline */}
                                    <line x1="20" y1="30" x2="180" y2="30" stroke="#6e7681" strokeWidth="1" opacity="0.4" />
                                    <circle cx="40" cy="30" r="4" fill="#7c3aed" opacity="0.5" />
                                    <circle cx="70" cy="30" r="4" fill="#7c3aed" opacity="0.6" />
                                    <circle cx="100" cy="30" r="5" fill="#7c3aed" opacity="0.8" />
                                    <circle cx="130" cy="30" r="4" fill="#7c3aed" opacity="0.6" />
                                    <circle cx="160" cy="30" r="6" fill="#a78bfa" opacity="1" />
                                    <circle cx="160" cy="30" r="2.5" fill="#fff" opacity="0.7" />
                                    {/* Labels */}
                                    <text x="30" y="47" fill="#6e7681" fontSize="7" fontFamily="monospace">v1.0</text>
                                    <text x="90" y="47" fill="#6e7681" fontSize="7" fontFamily="monospace">v2.0</text>
                                    <text x="148" y="47" fill="#a78bfa" fontSize="7" fontFamily="monospace">HEAD</text>
                                    {/* Branch */}
                                    <path d="M100 26 Q110 10 130 26" stroke="#60a5fa" strokeWidth="1" fill="none" opacity="0.5" />
                                    <circle cx="115" cy="14" r="3" fill="#60a5fa" opacity="0.5" />
                                </svg>
                            </div>
                            <h3>Git is the fourth dimension</h3>
                            <p>Move through commits while your spatial layout persists. See what changed, where it changed, and share your view with others via multiplayer.</p>
                        </div>
                    </div>

                    {/* Surface pitch — AI code review */}
                    <div className="landing-pitch">
                        <div className="pitch-badge">For developers right now</div>
                        <h2 className="pitch-title">Review AI-generated code<br /><span className="pitch-accent">without losing your mind</span></h2>
                        <p className="pitch-body">AI agents generate thousands of lines across dozens of files. Traditional file trees can't keep up. GitMaps renders every file simultaneously on an infinite canvas — so you can see the full picture, spot patterns, and review changes spatially instead of one-file-at-a-time.</p>
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
                        <div className="cta-or">or click Import from GitHub in the sidebar</div>
                    </div>

                    {/* Stats Row */}
                    <div className="landing-stats">
                        <div className="landing-stat">
                            <span className="stat-num">4D</span>
                            <span className="stat-desc">Dimensional Space</span>
                        </div>
                        <div className="stat-divider"></div>
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
