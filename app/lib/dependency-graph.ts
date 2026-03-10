// @ts-nocheck
/**
 * Dependency Graph View — force-directed layout of import relationships.
 *
 * Flow:
 *   1. Fetch import edges from /api/repo/imports API
 *   2. Build adjacency graph from file cards on canvas
 *   3. Run force-directed simulation (spring-charge model)
 *   4. Smoothly animate cards to new positions
 *   5. Draw dependency lines as SVG arrows on the overlay
 *
 * Toggle between spatial ↔ dependency layout with Ctrl+G or toolbar button.
 */
import { measure } from 'measure-fn';
import type { CanvasContext } from './context';
import { savePosition } from './positions';
import { updateMinimap } from './canvas';
import { renderConnections } from './connections';
import { showToast } from './utils';

// ─── State ──────────────────────────────────────────────
let _isGraphMode = false;
let _savedPositions: Map<string, { x: number; y: number }> = new Map();
let _graphEdges: { source: string; target: string }[] = [];
let _graphSvg: SVGGElement | null = null;

export function isGraphMode(): boolean { return _isGraphMode; }

// ─── Types ──────────────────────────────────────────────
interface Node {
    path: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    pinned: boolean;
}

// ─── Force-Directed Layout ──────────────────────────────
function forceDirectedLayout(
    nodes: Node[],
    edges: { source: string; target: string }[],
    iterations = 150,
): void {
    const nodeMap = new Map(nodes.map(n => [n.path, n]));

    // Scale forces based on number of nodes
    const N = nodes.length;
    const REPULSION = N > 50 ? 1_200_000 : 800_000;
    const SPRING_K = 0.006;
    const IDEAL_LEN = N > 80 ? 600 : N > 40 ? 500 : 400;
    const DAMPING = 0.88;
    const MAX_FORCE = 150;

    // ── Scatter initial positions around centroid ──
    // Starting from actual canvas positions (which may be spread over 20,000+ px)
    // means repulsion is negligible. Cluster nodes tightly first so forces work.
    const cx = nodes.reduce((s, n) => s + n.x, 0) / N;
    const cy = nodes.reduce((s, n) => s + n.y, 0) / N;
    const spread = Math.sqrt(N) * 80;  // Scale cluster size with node count

    for (const node of nodes) {
        node.x = cx + (Math.random() - 0.5) * spread;
        node.y = cy + (Math.random() - 0.5) * spread;
        node.vx = 0;
        node.vy = 0;
    }

    // ── Build adjacency for hub detection ──
    const degree = new Map<string, number>();
    for (const e of edges) {
        degree.set(e.source, (degree.get(e.source) || 0) + 1);
        degree.set(e.target, (degree.get(e.target) || 0) + 1);
    }

    for (let iter = 0; iter < iterations; iter++) {
        const temp = 1 - (iter / iterations) * 0.7; // Slower cooling

        // ── Repulsion (all pairs) ──
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i]!, b = nodes[j]!;
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 30);
                const force = REPULSION / (dist * dist);
                const fx = Math.min(Math.max((dx / dist) * force, -MAX_FORCE), MAX_FORCE);
                const fy = Math.min(Math.max((dy / dist) * force, -MAX_FORCE), MAX_FORCE);
                a.vx -= fx * temp;
                a.vy -= fy * temp;
                b.vx += fx * temp;
                b.vy += fy * temp;
            }
        }

        // ── Attraction (edges only) ──
        for (const edge of edges) {
            const a = nodeMap.get(edge.source);
            const b = nodeMap.get(edge.target);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const displacement = dist - IDEAL_LEN;
            const fx = Math.min(Math.max(SPRING_K * displacement * (dx / dist), -MAX_FORCE), MAX_FORCE);
            const fy = Math.min(Math.max(SPRING_K * displacement * (dy / dist), -MAX_FORCE), MAX_FORCE);
            a.vx += fx * temp;
            a.vy += fy * temp;
            b.vx -= fx * temp;
            b.vy -= fy * temp;
        }

        // ── Gravity toward center to prevent drift ──
        const gcx = nodes.reduce((s, n) => s + n.x, 0) / N;
        const gcy = nodes.reduce((s, n) => s + n.y, 0) / N;
        for (const node of nodes) {
            node.vx += (gcx - node.x) * 0.0005 * temp;
            node.vy += (gcy - node.y) * 0.0005 * temp;
        }

        // ── Apply velocities ──
        for (const node of nodes) {
            if (node.pinned) continue;
            node.vx *= DAMPING;
            node.vy *= DAMPING;
            node.x += node.vx;
            node.y += node.vy;
        }
    }
}

// ─── Animate cards to target positions ──────────────────
function animateToPositions(
    ctx: CanvasContext,
    targets: Map<string, { x: number; y: number }>,
    durationMs = 600,
) {
    const starts = new Map<string, { x: number; y: number }>();
    for (const [path, target] of targets) {
        const card = ctx.fileCards.get(path);
        if (card) {
            starts.set(path, {
                x: parseFloat(card.style.left) || 0,
                y: parseFloat(card.style.top) || 0,
            });
        }
        // Also animate deferred cards
        const deferred = ctx.deferredCards?.get(path);
        if (deferred && !starts.has(path)) {
            starts.set(path, { x: deferred.x, y: deferred.y });
        }
    }

    const t0 = performance.now();
    const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic

    function frame() {
        const elapsed = performance.now() - t0;
        const progress = Math.min(elapsed / durationMs, 1);
        const eased = ease(progress);
        const commitHash = ctx.snap().context.currentCommitHash || 'allfiles';

        for (const [path, target] of targets) {
            const start = starts.get(path);
            if (!start) continue;
            const x = start.x + (target.x - start.x) * eased;
            const y = start.y + (target.y - start.y) * eased;

            // Update DOM card
            const card = ctx.fileCards.get(path);
            if (card) {
                card.style.left = `${x}px`;
                card.style.top = `${y}px`;
            }
            // Update deferred entry
            const deferred = ctx.deferredCards?.get(path);
            if (deferred) { deferred.x = x; deferred.y = y; }
            // Update pill
            const pill = document.querySelector(`.file-card-pill[data-path="${CSS.escape(path)}"]`) as HTMLElement;
            if (pill) { pill.style.left = `${x}px`; pill.style.top = `${y}px`; }

            if (progress >= 1) {
                savePosition(ctx, commitHash, path, target.x, target.y);
            }
        }

        renderConnections(ctx);

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            updateMinimap(ctx);
            renderGraphEdges(ctx);
        }
    }

    requestAnimationFrame(frame);
}

// ─── Render graph edges as SVG arrows ───────────────────
function renderGraphEdges(ctx: CanvasContext) {
    if (!ctx.svgOverlay) return;

    // Remove old graph edges
    if (_graphSvg) { _graphSvg.remove(); _graphSvg = null; }
    if (!_isGraphMode || _graphEdges.length === 0) return;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'dependency-graph-edges');

    // Ensure arrowhead marker exists
    let defs = ctx.svgOverlay.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        ctx.svgOverlay.prepend(defs);
    }
    if (!defs.querySelector('#dep-arrow')) {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'dep-arrow');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '10');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '8');
        marker.setAttribute('markerHeight', '8');
        marker.setAttribute('orient', 'auto-start-reverse');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        path.setAttribute('fill', 'rgba(168, 130, 255, 0.7)');
        marker.appendChild(path);
        defs.appendChild(marker);
    }

    // Build lookup for inbound edge count per file to colorize
    const inbound = new Map<string, number>();
    for (const edge of _graphEdges) {
        inbound.set(edge.target, (inbound.get(edge.target) || 0) + 1);
    }
    const maxInbound = Math.max(...inbound.values(), 1);

    for (const edge of _graphEdges) {
        const srcCard = ctx.fileCards.get(edge.source);
        const tgtCard = ctx.fileCards.get(edge.target);
        // Fall back to deferred card positions
        const srcDeferred = ctx.deferredCards?.get(edge.source);
        const tgtDeferred = ctx.deferredCards?.get(edge.target);

        let sx: number, sy: number, tx: number, ty: number;
        if (srcCard) {
            sx = parseFloat(srcCard.style.left) + (srcCard.offsetWidth || 580) / 2;
            sy = parseFloat(srcCard.style.top) + (srcCard.offsetHeight || 400) / 2;
        } else if (srcDeferred) {
            sx = srcDeferred.x + (srcDeferred.size?.width || 580) / 2;
            sy = srcDeferred.y + (srcDeferred.size?.height || 400) / 2;
        } else continue;

        if (tgtCard) {
            tx = parseFloat(tgtCard.style.left) + (tgtCard.offsetWidth || 580) / 2;
            ty = parseFloat(tgtCard.style.top) + (tgtCard.offsetHeight || 400) / 2;
        } else if (tgtDeferred) {
            tx = tgtDeferred.x + (tgtDeferred.size?.width || 580) / 2;
            ty = tgtDeferred.y + (tgtDeferred.size?.height || 400) / 2;
        } else continue;

        // Use curved path for better visual clarity
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const curvature = Math.min(dist * 0.15, 80);
        const mx = (sx + tx) / 2 - (dy / dist) * curvature;
        const my = (sy + ty) / 2 + (dx / dist) * curvature;

        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`);

        // Color intensity based on how many things import the target
        const intensity = Math.min((inbound.get(edge.target) || 1) / maxInbound + 0.3, 1);
        pathEl.setAttribute('stroke', `rgba(168, 130, 255, ${(0.2 + intensity * 0.4).toFixed(2)})`);
        pathEl.setAttribute('stroke-width', '2');
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke-dasharray', '8,4');
        pathEl.setAttribute('marker-end', 'url(#dep-arrow)');
        g.appendChild(pathEl);
    }

    ctx.svgOverlay.appendChild(g);
    _graphSvg = g;
}

// ─── Toggle Graph Mode ──────────────────────────────────
export async function toggleDependencyGraph(ctx: CanvasContext) {
    if (_isGraphMode) {
        // Restore original positions
        _isGraphMode = false;
        document.getElementById('dep-graph-btn')?.classList.remove('active');

        if (_savedPositions.size > 0) {
            showToast('Restoring spatial layout...', 'info');
            animateToPositions(ctx, _savedPositions, 500);
            _savedPositions.clear();
        }

        // Remove graph edges
        if (_graphSvg) { _graphSvg.remove(); _graphSvg = null; }

        return;
    }

    // Enter graph mode
    _isGraphMode = true;
    document.getElementById('dep-graph-btn')?.classList.add('active');
    showToast('Building dependency graph...', 'info');

    await measure('depGraph:layout', async () => {
        const state = ctx.snap().context;
        const repoPath = state.repoPath;
        const commit = state.currentCommitHash || 'HEAD';

        if (!repoPath) {
            _isGraphMode = false;
            document.getElementById('dep-graph-btn')?.classList.remove('active');
            showToast('Load a repository first', 'error');
            return;
        }

        // ── 1. Save current positions ──
        _savedPositions.clear();
        for (const [path, card] of ctx.fileCards) {
            _savedPositions.set(path, {
                x: parseFloat(card.style.left) || 0,
                y: parseFloat(card.style.top) || 0,
            });
        }
        if (ctx.deferredCards) {
            for (const [path, entry] of ctx.deferredCards) {
                if (!_savedPositions.has(path)) {
                    _savedPositions.set(path, { x: entry.x, y: entry.y });
                }
            }
        }

        // ── 2. Fetch import edges ──
        try {
            const res = await fetch('/api/repo/imports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: repoPath, commit }),
            });
            if (!res.ok) {
                _isGraphMode = false;
                document.getElementById('dep-graph-btn')?.classList.remove('active');
                showToast('Failed to fetch import data', 'error');
                return;
            }
            const data = await res.json();
            const edges = (data.edges || []) as { source: string; target: string; line: number }[];

            // Filter to edges where both files are on the canvas
            const canvasFiles = new Set([...ctx.fileCards.keys()]);
            if (ctx.deferredCards) {
                for (const path of ctx.deferredCards.keys()) canvasFiles.add(path);
            }

            _graphEdges = edges.filter(e => canvasFiles.has(e.source) && canvasFiles.has(e.target));

            if (_graphEdges.length === 0) {
                _isGraphMode = false;
                document.getElementById('dep-graph-btn')?.classList.remove('active');
                showToast(`No import relationships found (${data.filesScanned} files scanned)`, 'info');
                return;
            }

            console.log(`[dep-graph] ${_graphEdges.length} edges across ${canvasFiles.size} canvas files`);
        } catch (err) {
            _isGraphMode = false;
            document.getElementById('dep-graph-btn')?.classList.remove('active');
            showToast('Error scanning imports', 'error');
            return;
        }

        // ── 3. Build nodes from canvas cards ──
        const connectedFiles = new Set<string>();
        for (const e of _graphEdges) { connectedFiles.add(e.source); connectedFiles.add(e.target); }

        // Center of current viewport
        const centerX = _savedPositions.size > 0
            ? [..._savedPositions.values()].reduce((s, p) => s + p.x, 0) / _savedPositions.size
            : 2000;
        const centerY = _savedPositions.size > 0
            ? [..._savedPositions.values()].reduce((s, p) => s + p.y, 0) / _savedPositions.size
            : 2000;

        const nodes: Node[] = [];
        for (const path of connectedFiles) {
            const saved = _savedPositions.get(path);
            const card = ctx.fileCards.get(path);
            nodes.push({
                path,
                x: saved?.x ?? centerX + (Math.random() - 0.5) * 1000,
                y: saved?.y ?? centerY + (Math.random() - 0.5) * 1000,
                vx: 0,
                vy: 0,
                w: card?.offsetWidth || 580,
                h: card?.offsetHeight || 400,
                pinned: false,
            });
        }

        // ── 4. Run force simulation ──
        forceDirectedLayout(nodes, _graphEdges, 150);

        // ── 5. Center the result around the original centroid ──
        const graphCenterX = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
        const graphCenterY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
        const offsetX = centerX - graphCenterX;
        const offsetY = centerY - graphCenterY;

        const targets = new Map<string, { x: number; y: number }>();
        for (const node of nodes) {
            targets.set(node.path, { x: node.x + offsetX, y: node.y + offsetY });
        }

        // ── 6. Animate to new positions ──
        showToast(`📊 ${connectedFiles.size} files, ${_graphEdges.length} dependencies`, 'success');
        animateToPositions(ctx, targets, 800);
    });
}

// ─── Keyboard shortcut registration ─────────────────────
export function setupDependencyGraphShortcut(ctx: CanvasContext) {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'g' && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            toggleDependencyGraph(ctx);
        }
    });
}
