// @ts-nocheck
/**
 * Performance measurement overlay — toggled with Shift+P.
 *
 * Shows a floating HUD with real-time metrics:
 *   - FPS (frames per second) with color-coded indicator
 *   - DOM node count (total elements in document)
 *   - Visible vs culled card count
 *   - Current zoom level
 *   - Memory usage (if available)
 *
 * Zero overhead when hidden — the rAF loop only runs when visible.
 */
import type { CanvasContext } from './context';
import { performViewportCulling } from './viewport-culling';

// ── State ──────────────────────────────────────────────────
let _overlay: HTMLElement | null = null;
let _visible = false;
let _rafId: number | null = null;
let _ctx: CanvasContext | null = null;

// FPS tracking
let _frameCount = 0;
let _lastFpsTime = 0;
let _currentFps = 0;
let _fpsHistory: number[] = [];
const FPS_HISTORY_LENGTH = 60; // 1 second of history at 60fps
let _lastFrameTime = 0; // ms per frame

// DOM count tracking (expensive, sample every ~500ms)
let _lastDomCount = 0;
let _lastDomTime = 0;

// Render timing (external instrumentation can set these)
let _lastCullTimeMs = 0;
let _lastRenderTimeMs = 0;

/** Set cull/render timing from external code (viewport-culling, connections) */
export function reportRenderTiming(phase: 'cull' | 'render', ms: number) {
    if (phase === 'cull') _lastCullTimeMs = ms;
    else _lastRenderTimeMs = ms;
}

// ── DOM Elements (cached) ──────────────────────────────────
let _elFps: HTMLElement;
let _elFpsBar: HTMLElement;
let _elFpsGraph: HTMLCanvasElement;
let _elDom: HTMLElement;
let _elCards: HTMLElement;
let _elZoom: HTMLElement;
let _elMemory: HTMLElement;
let _elFrameTime: HTMLElement;
let _elConnections: HTMLElement;
let _elRenderBudget: HTMLElement;
let _elRenderBudgetBar: HTMLElement;

/**
 * Creates the overlay DOM once.
 */
function createOverlay(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'perf-overlay';
    el.style.cssText = `
        position: fixed;
        top: 60px;
        right: 16px;
        z-index: 10000;
        width: 220px;
        background: rgba(6, 6, 18, 0.92);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(128, 128, 200, 0.15);
        border-radius: 12px;
        padding: 14px 16px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 11px;
        color: #a0a0cc;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(124, 58, 237, 0.08);
        pointer-events: auto;
        user-select: none;
        display: none;
        line-height: 1.4;
    `;

    el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <span style="font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#7c7cb0;">⚡ Performance</span>
            <span id="perf-close" style="cursor:pointer;color:#5a5a7a;font-size:14px;line-height:1;" title="Close (Shift+P)">✕</span>
        </div>
        <canvas id="perf-fps-graph" width="376" height="60" style="width:188px;height:30px;border-radius:6px;background:rgba(0,0,0,0.3);margin-bottom:8px;display:block;"></canvas>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            <div class="perf-stat">
                <div class="perf-label">FPS</div>
                <div class="perf-value" id="perf-fps">--</div>
                <div class="perf-bar-wrap"><div class="perf-bar" id="perf-fps-bar" style="width:0%;background:#22c55e;"></div></div>
            </div>
            <div class="perf-stat">
                <div class="perf-label">DOM Nodes</div>
                <div class="perf-value" id="perf-dom">--</div>
            </div>
            <div class="perf-stat">
                <div class="perf-label">Cards</div>
                <div class="perf-value" id="perf-cards">--</div>
            </div>
            <div class="perf-stat">
                <div class="perf-label">Zoom</div>
                <div class="perf-value" id="perf-zoom">--</div>
            </div>
            <div class="perf-stat">
                <div class="perf-label">Frame</div>
                <div class="perf-value" id="perf-frametime">--</div>
            </div>
            <div class="perf-stat">
                <div class="perf-label">Lines</div>
                <div class="perf-value" id="perf-connections">--</div>
            </div>
        </div>
        <div class="perf-stat" style="margin-top:6px;">
            <div class="perf-label">Render Budget</div>
            <div style="display:flex;align-items:center;gap:6px">
                <div class="perf-value" id="perf-render-budget" style="min-width:50px">--</div>
                <div class="perf-bar-wrap" style="flex:1">
                    <div class="perf-bar" id="perf-render-budget-bar" style="width:0%;background:#22c55e;"></div>
                </div>
            </div>
        </div>
        <div class="perf-stat" style="margin-top:6px;">
            <div class="perf-label">Memory</div>
            <div class="perf-value" id="perf-memory">--</div>
        </div>
    `;

    // Inject scoped styles
    const style = document.createElement('style');
    style.textContent = `
        #perf-overlay .perf-stat {
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            padding: 6px 10px;
            border: 1px solid rgba(128,128,200,0.06);
        }
        #perf-overlay .perf-label {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #5a5a7a;
            margin-bottom: 2px;
        }
        #perf-overlay .perf-value {
            font-size: 14px;
            font-weight: 700;
            color: #e0e0f0;
        }
        #perf-overlay .perf-bar-wrap {
            height: 3px;
            background: rgba(255,255,255,0.05);
            border-radius: 2px;
            margin-top: 4px;
            overflow: hidden;
        }
        #perf-overlay .perf-bar {
            height: 100%;
            border-radius: 2px;
            transition: width 0.3s ease, background 0.3s ease;
        }
        #perf-overlay #perf-close:hover {
            color: #ef4444;
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(el);

    // Cache element refs
    _elFps = el.querySelector('#perf-fps')!;
    _elFpsBar = el.querySelector('#perf-fps-bar')!;
    _elFpsGraph = el.querySelector('#perf-fps-graph')! as HTMLCanvasElement;
    _elDom = el.querySelector('#perf-dom')!;
    _elCards = el.querySelector('#perf-cards')!;
    _elZoom = el.querySelector('#perf-zoom')!;
    _elMemory = el.querySelector('#perf-memory')!;
    _elFrameTime = el.querySelector('#perf-frametime')!;
    _elConnections = el.querySelector('#perf-connections')!;
    _elRenderBudget = el.querySelector('#perf-render-budget')!;
    _elRenderBudgetBar = el.querySelector('#perf-render-budget-bar')!;

    // Close button
    el.querySelector('#perf-close')!.addEventListener('click', () => togglePerfOverlay(_ctx!));

    // Make draggable
    let isDragging = false;
    let dX = 0, dY = 0;
    const header = el.querySelector('div')! as HTMLElement;
    header.style.cursor = 'grab';
    header.addEventListener('pointerdown', (e: PointerEvent) => {
        isDragging = true;
        dX = e.clientX - el.offsetLeft;
        dY = e.clientY - el.offsetTop;
        header.style.cursor = 'grabbing';
        e.preventDefault();
    });
    window.addEventListener('pointermove', (e: PointerEvent) => {
        if (!isDragging) return;
        el.style.right = 'auto';
        el.style.left = (e.clientX - dX) + 'px';
        el.style.top = (e.clientY - dY) + 'px';
    });
    window.addEventListener('pointerup', () => {
        isDragging = false;
        header.style.cursor = 'grab';
    });

    return el;
}

/**
 * Gets the FPS color based on performance level.
 */
function fpsColor(fps: number): string {
    if (fps >= 55) return '#22c55e'; // green — great
    if (fps >= 40) return '#fbbf24'; // amber — okay
    if (fps >= 25) return '#f97316'; // orange — struggling
    return '#ef4444'; // red — bad
}

/**
 * Draws the FPS sparkline graph.
 */
function drawFpsGraph() {
    const ctx = _elFpsGraph.getContext('2d')!;
    const w = _elFpsGraph.width;
    const h = _elFpsGraph.height;
    ctx.clearRect(0, 0, w, h);

    if (_fpsHistory.length < 2) return;

    const max = 65;
    const step = w / (FPS_HISTORY_LENGTH - 1);

    // Area fill
    ctx.beginPath();
    ctx.moveTo(0, h);
    _fpsHistory.forEach((fps, i) => {
        const x = i * step;
        const y = h - (Math.min(fps, max) / max) * h;
        if (i === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.lineTo((_fpsHistory.length - 1) * step, h);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    const color = fpsColor(_currentFps);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '05');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    _fpsHistory.forEach((fps, i) => {
        const x = i * step;
        const y = h - (Math.min(fps, max) / max) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 60fps target line
    const targetY = h - (60 / max) * h;
    ctx.strokeStyle = 'rgba(128, 128, 200, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(w, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
}

/**
 * The main measurement loop — runs only when overlay is visible.
 */
function measureFrame(timestamp: number) {
    if (!_visible || !_ctx) return;

    // Frame time (ms since last frame)
    if (_lastFrameTime > 0) {
        const frameMs = timestamp - _lastFrameTime;
        const frameMsRounded = Math.round(frameMs * 10) / 10;
        _elFrameTime.textContent = frameMsRounded + 'ms';
        if (frameMs > 33) _elFrameTime.style.color = '#ef4444'; // < 30fps
        else if (frameMs > 20) _elFrameTime.style.color = '#fbbf24'; // < 50fps
        else _elFrameTime.style.color = '#e0e0f0';
    }
    _lastFrameTime = timestamp;

    _frameCount++;

    // Calculate FPS every 500ms
    if (timestamp - _lastFpsTime >= 500) {
        _currentFps = Math.round((_frameCount * 1000) / (timestamp - _lastFpsTime));
        _frameCount = 0;
        _lastFpsTime = timestamp;

        // Update FPS display
        const color = fpsColor(_currentFps);
        _elFps.textContent = _currentFps.toString();
        _elFps.style.color = color;
        _elFpsBar.style.width = Math.min((_currentFps / 60) * 100, 100) + '%';
        _elFpsBar.style.background = color;

        // FPS history for graph
        _fpsHistory.push(_currentFps);
        if (_fpsHistory.length > FPS_HISTORY_LENGTH) _fpsHistory.shift();
        drawFpsGraph();
    }

    // Sample DOM count every ~1s (expensive operation)
    if (timestamp - _lastDomTime >= 1000) {
        _lastDomCount = document.querySelectorAll('*').length;
        _lastDomTime = timestamp;
        _elDom.textContent = _lastDomCount.toLocaleString();

        // Color code DOM count
        if (_lastDomCount > 10000) _elDom.style.color = '#ef4444';
        else if (_lastDomCount > 5000) _elDom.style.color = '#fbbf24';
        else _elDom.style.color = '#e0e0f0';
    }

    // Cards visible/culled (cheap — read from existing state)
    if (_ctx.fileCards) {
        const total = _ctx.fileCards.size;
        let culled = 0;
        for (const [, card] of _ctx.fileCards) {
            if (card.dataset.culled === 'true') culled++;
        }
        const visible = total - culled;
        _elCards.textContent = `${visible}/${total}`;
        _elCards.style.color = culled > 0 ? '#22c55e' : '#e0e0f0';
    }

    // Connection line count
    const svgLayer = _ctx.connectionLayer || document.querySelector('.connections-layer');
    if (svgLayer) {
        const lineCount = svgLayer.querySelectorAll('line, path').length;
        _elConnections.textContent = lineCount.toLocaleString();
        if (lineCount > 1000) _elConnections.style.color = '#ef4444';
        else if (lineCount > 500) _elConnections.style.color = '#fbbf24';
        else _elConnections.style.color = '#e0e0f0';
    }

    // Zoom level
    if (_ctx.snap) {
        try {
            const state = _ctx.snap().context;
            const zoomPct = Math.round(state.zoom * 100);
            _elZoom.textContent = zoomPct + '%';
        } catch (_) { }
    }

    // Render budget: cull + render time vs 16.67ms target
    const totalRenderMs = _lastCullTimeMs + _lastRenderTimeMs;
    if (totalRenderMs > 0) {
        const budgetPct = Math.min((totalRenderMs / 16.67) * 100, 100);
        _elRenderBudget.textContent = totalRenderMs.toFixed(1) + 'ms';
        _elRenderBudgetBar.style.width = budgetPct + '%';
        if (totalRenderMs > 16.67) {
            _elRenderBudget.style.color = '#ef4444';
            _elRenderBudgetBar.style.background = '#ef4444';
        } else if (totalRenderMs > 10) {
            _elRenderBudget.style.color = '#fbbf24';
            _elRenderBudgetBar.style.background = '#fbbf24';
        } else {
            _elRenderBudget.style.color = '#22c55e';
            _elRenderBudgetBar.style.background = '#22c55e';
        }
    }

    // Memory (Chrome only)
    const perf = (performance as any);
    if (perf.memory) {
        const usedMB = Math.round(perf.memory.usedJSHeapSize / 1048576);
        const totalMB = Math.round(perf.memory.jsHeapSizeLimit / 1048576);
        _elMemory.textContent = `${usedMB}MB / ${totalMB}MB`;
        if (usedMB > totalMB * 0.8) _elMemory.style.color = '#ef4444';
        else if (usedMB > totalMB * 0.5) _elMemory.style.color = '#fbbf24';
        else _elMemory.style.color = '#e0e0f0';
    } else {
        _elMemory.textContent = 'N/A';
    }

    _rafId = requestAnimationFrame(measureFrame);
}

/**
 * Toggle the performance overlay visibility.
 */
export function togglePerfOverlay(ctx: CanvasContext) {
    _ctx = ctx;
    if (!_overlay) _overlay = createOverlay();

    _visible = !_visible;

    if (_visible) {
        _overlay.style.display = 'block';
        _frameCount = 0;
        _lastFpsTime = performance.now();
        _lastDomTime = 0;
        _fpsHistory = [];
        _rafId = requestAnimationFrame(measureFrame);
    } else {
        _overlay.style.display = 'none';
        if (_rafId) {
            cancelAnimationFrame(_rafId);
            _rafId = null;
        }
    }
}

/**
 * Setup the Shift+P keyboard shortcut.
 * Call this once during app initialization.
 */
export function setupPerfOverlay(ctx: CanvasContext) {
    _ctx = ctx;
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        // Don't steal Shift+P from text inputs
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
        if (e.shiftKey && e.key === 'P') {
            e.preventDefault();
            togglePerfOverlay(ctx);
        }
    });
}
