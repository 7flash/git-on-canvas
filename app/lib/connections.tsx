// @ts-nocheck
/**
 * Connections — click-on-line to connect, render SVG lines with labels,
 * left-side marker strip, navigate.
 *
 * Flow:
 *   1. User clicks a line number/gutter → starts pending connection (source)
 *   2. All cards show a subtle "click a target line" visual hint (border glow)
 *   3. User clicks a line in another card → completes connection
 *   4. Connection markers appear on the LEFT side of both cards
 *   5. SVG bezier curves with gradient & filename labels connect the two lines
 *   6. No toasts — visual feedback only (glows, highlights, labels)
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { escapeHtml } from './utils';
import { updateCanvasTransform, updateZoomUI } from './canvas';

// ─── Pending connection state ────────────────────────────
let pendingConnection: {
    sourceFile: string;
    sourceLine: number;
    sourceCard: HTMLElement;
} | null = null;

// ─── Status indicator element ────────────────────────────
let statusIndicator: HTMLElement | null = null;

function _showStatus(text: string) {
    if (!statusIndicator) {
        statusIndicator = document.createElement('div');
        statusIndicator.className = 'conn-status-indicator';
        document.body.appendChild(statusIndicator);
    }
    statusIndicator.textContent = text;
    statusIndicator.classList.add('visible');
}

function _hideStatus() {
    if (statusIndicator) {
        statusIndicator.classList.remove('visible');
    }
}

// ─── Setup click-on-line connection for a card ──────────
export function setupLineClickConnection(ctx: CanvasContext, card: HTMLElement, filePath: string) {
    const body = card.querySelector('.file-card-body') as HTMLElement;
    if (!body) return;

    body.addEventListener('click', (e) => {
        const lineEl = (e.target as HTMLElement).closest('.diff-line') as HTMLElement;
        if (!lineEl) return;

        const lineNum = parseInt(lineEl.dataset.line);
        if (!lineNum) return;

        // If we're in "connecting" mode and clicking a line in a DIFFERENT card
        if (pendingConnection && pendingConnection.sourceCard !== card) {
            e.stopPropagation();
            e.preventDefault();

            // Complete the connection
            const srcName = pendingConnection.sourceFile.split('/').pop();
            const tgtName = filePath.split('/').pop();
            const conn = {
                id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                sourceFile: pendingConnection.sourceFile,
                sourceLineStart: pendingConnection.sourceLine,
                sourceLineEnd: pendingConnection.sourceLine,
                targetFile: filePath,
                targetLineStart: lineNum,
                targetLineEnd: lineNum,
                comment: `${srcName}:${pendingConnection.sourceLine} → ${tgtName}:${lineNum}`,
            };

            ctx.actor.send({
                type: 'START_CONNECTION',
                sourceFile: conn.sourceFile,
                lineStart: conn.sourceLineStart,
                lineEnd: conn.sourceLineEnd,
            });
            ctx.actor.send({
                type: 'COMPLETE_CONNECTION',
                targetFile: conn.targetFile,
                lineStart: conn.targetLineStart,
                lineEnd: conn.targetLineEnd,
                comment: conn.comment,
            });

            // Clear pending
            _clearPending(ctx);

            renderConnections(ctx);
            buildConnectionMarkers(ctx);
            saveConnections(ctx);
            return;
        }

        // If clicking same card and already pending → cancel
        if (pendingConnection && pendingConnection.sourceCard === card) {
            _clearPending(ctx);
            return;
        }

        // Start a new pending connection
        e.stopPropagation();
        const fileName = filePath.split('/').pop();
        pendingConnection = { sourceFile: filePath, sourceLine: lineNum, sourceCard: card };

        // Visual: highlight the source line
        lineEl.classList.add('connection-source-line');
        card.classList.add('connecting-source');

        // Highlight all other cards as potential targets
        ctx.fileCards.forEach((c, p) => {
            if (p !== filePath) c.classList.add('connect-target-ready');
        });

        _showStatus(`Connecting from ${fileName}:${lineNum} — click a line in another file`);
    });
}

function _clearPending(ctx: CanvasContext) {
    if (!pendingConnection) return;
    // Remove visual highlights
    pendingConnection.sourceCard.querySelector('.connection-source-line')?.classList.remove('connection-source-line');
    pendingConnection.sourceCard.classList.remove('connecting-source');
    ctx.fileCards.forEach((c) => c.classList.remove('connect-target-ready'));
    pendingConnection = null;
    _hideStatus();
}

// ─── Cancel pending connection (called from Escape key) ──
export function cancelPendingConnection(ctx: CanvasContext) {
    if (pendingConnection) {
        _clearPending(ctx);
    }
}

export function hasPendingConnection(): boolean {
    return pendingConnection !== null;
}

// ─── Build connection marker strips (LEFT side of cards) ─
export function buildConnectionMarkers(ctx: CanvasContext) {
    const state = ctx.snap().context;
    const connections = state.connections || [];

    // First clean up all existing markers
    ctx.fileCards.forEach((card) => {
        card.querySelector('.conn-marker-strip')?.remove();
    });

    if (connections.length === 0) return;

    // Group connections by file
    const connsByFile = new Map<string, Array<{ line: number; conn: any; role: 'source' | 'target' }>>();

    connections.forEach(conn => {
        // Source side
        if (!connsByFile.has(conn.sourceFile)) connsByFile.set(conn.sourceFile, []);
        connsByFile.get(conn.sourceFile)!.push({
            line: conn.sourceLineStart,
            conn,
            role: 'source',
        });

        // Target side
        if (!connsByFile.has(conn.targetFile)) connsByFile.set(conn.targetFile, []);
        connsByFile.get(conn.targetFile)!.push({
            line: conn.targetLineStart,
            conn,
            role: 'target',
        });
    });

    // Build marker strip for each file card
    connsByFile.forEach((markers, filePath) => {
        const card = ctx.fileCards.get(filePath);
        if (!card) return;

        const body = card.querySelector('.file-card-body') as HTMLElement;
        if (!body) return;

        const pre = body.querySelector('pre') as HTMLElement;
        if (!pre) return;

        const totalLines = pre.querySelectorAll('.diff-line').length || 1;

        const strip = document.createElement('div');
        strip.className = 'conn-marker-strip';

        markers.forEach(({ line, conn, role }) => {
            const pct = ((line - 1) / totalLines) * 100;
            const marker = document.createElement('div');
            marker.className = `conn-marker conn-marker--${role}`;
            marker.style.top = `${pct}%`;

            const otherFile = role === 'source' ? conn.targetFile : conn.sourceFile;
            const otherLine = role === 'source' ? conn.targetLineStart : conn.sourceLineStart;
            const otherName = otherFile.split('/').pop();
            marker.title = `${role === 'source' ? '→' : '←'} ${otherName}:${otherLine}`;

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateToConnection(ctx, conn, role === 'source' ? 'target' : 'source');
            });

            // Right-click to delete
            marker.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteConnection(ctx, conn.id);
            });

            strip.appendChild(marker);
        });

        body.appendChild(strip);
    });
}

// ─── SVG defs (gradients, filters) ──────────────────────
function _ensureSvgDefs(svg: SVGSVGElement) {
    if (svg.querySelector('defs#conn-defs')) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.id = 'conn-defs';

    // Connection gradient 
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.id = 'conn-gradient';
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#a78bfa');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#60a5fa');
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);

    // Glow filter
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.id = 'conn-glow';
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');
    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('stdDeviation', '3');
    blur.setAttribute('result', 'glow');
    const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const mNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    mNode1.setAttribute('in', 'glow');
    const mNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    mNode2.setAttribute('in', 'SourceGraphic');
    merge.appendChild(mNode1);
    merge.appendChild(mNode2);
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);

    svg.insertBefore(defs, svg.firstChild);
}

// ─── Render all SVG connection lines ────────────────────
export function renderConnections(ctx: CanvasContext) {
    if (!ctx.svgOverlay) return;
    ctx.svgOverlay.innerHTML = '';

    const state = ctx.snap().context;
    const connections = state.connections || [];
    if (connections.length === 0) return;

    _ensureSvgDefs(ctx.svgOverlay);

    connections.forEach(conn => {
        const sourceCard = ctx.fileCards.get(conn.sourceFile);
        const targetCard = ctx.fileCards.get(conn.targetFile);
        if (!sourceCard || !targetCard) return;

        // Get canvas-space coordinates for the line endpoints
        const startPt = _getLinePoint(sourceCard, conn.sourceLineStart, 'right');
        const endPt = _getLinePoint(targetCard, conn.targetLineStart, 'left');

        // Decide curve direction based on card positions
        const goingRight = endPt.x >= startPt.x;
        const dx = Math.abs(endPt.x - startPt.x);
        const dy = Math.abs(endPt.y - startPt.y);
        const ctrlOffset = Math.max(60, Math.min(dx * 0.4, 200));

        // Bezier: from right side of source → left side of target
        let d: string;
        if (goingRight) {
            d = `M ${startPt.x} ${startPt.y} C ${startPt.x + ctrlOffset} ${startPt.y}, ${endPt.x - ctrlOffset} ${endPt.y}, ${endPt.x} ${endPt.y}`;
        } else {
            // Cards overlap or wrong order — curve around
            const arcHeight = Math.max(80, dy * 0.3);
            d = `M ${startPt.x} ${startPt.y} C ${startPt.x + ctrlOffset} ${startPt.y - arcHeight}, ${endPt.x - ctrlOffset} ${endPt.y - arcHeight}, ${endPt.x} ${endPt.y}`;
        }

        // Connection group
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.classList.add('conn-group');
        group.dataset.connId = conn.id;

        // Glow path (underneath)
        const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        glowPath.setAttribute('d', d);
        glowPath.setAttribute('stroke', '#a78bfa');
        glowPath.setAttribute('stroke-width', '6');
        glowPath.setAttribute('fill', 'none');
        glowPath.setAttribute('opacity', '0');
        glowPath.classList.add('conn-glow-path');
        group.appendChild(glowPath);

        // Main path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', 'url(#conn-gradient)');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.7');
        path.classList.add('conn-main-path');
        path.style.cursor = 'pointer';
        path.style.pointerEvents = 'stroke';

        // Animated dash
        const pathLength = _estimatePathLength(startPt, endPt);
        path.setAttribute('stroke-dasharray', '8 4');

        group.appendChild(path);

        // Endpoint circles
        const srcCircle = _makeEndpoint(startPt.x, startPt.y, '#a78bfa');
        const tgtCircle = _makeEndpoint(endPt.x, endPt.y, '#60a5fa');
        group.appendChild(srcCircle);
        group.appendChild(tgtCircle);

        // Label badge at midpoint
        const midX = (startPt.x + endPt.x) / 2;
        const midY = (startPt.y + endPt.y) / 2 - (goingRight ? 0 : ctrlOffset * 0.3);

        const srcName = conn.sourceFile.split('/').pop() || '';
        const tgtName = conn.targetFile.split('/').pop() || '';
        const labelText = `${srcName}:${conn.sourceLineStart} → ${tgtName}:${conn.targetLineStart}`;

        const labelGroup = _makeLabel(midX, midY, labelText);
        labelGroup.classList.add('conn-label');
        group.appendChild(labelGroup);

        // Hover: brighten
        group.addEventListener('mouseenter', () => {
            path.setAttribute('stroke-width', '4');
            path.setAttribute('opacity', '1');
            glowPath.setAttribute('opacity', '0.15');
            srcCircle.setAttribute('r', '7');
            tgtCircle.setAttribute('r', '7');
            labelGroup.style.opacity = '1';
        });
        group.addEventListener('mouseleave', () => {
            path.setAttribute('stroke-width', '2.5');
            path.setAttribute('opacity', '0.7');
            glowPath.setAttribute('opacity', '0');
            srcCircle.setAttribute('r', '5');
            tgtCircle.setAttribute('r', '5');
            labelGroup.style.opacity = '0.85';
        });

        // Click → navigate
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateToConnection(ctx, conn, 'target');
        });

        // Right-click → delete
        group.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteConnection(ctx, conn.id);
        });

        ctx.svgOverlay.appendChild(group);
    });
}

function _makeEndpoint(x: number, y: number, color: string): SVGCircleElement {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', '5');
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', 'rgba(0,0,0,0.5)');
    circle.setAttribute('stroke-width', '1');
    circle.style.transition = 'r 0.15s ease';
    return circle;
}

function _makeLabel(x: number, y: number, text: string): SVGGElement {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.style.opacity = '0.85';
    group.style.transition = 'opacity 0.15s ease';
    group.style.pointerEvents = 'all';
    group.style.cursor = 'pointer';

    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', String(x));
    textEl.setAttribute('y', String(y));
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('alignment-baseline', 'middle');
    textEl.setAttribute('fill', '#e0e0f0');
    textEl.setAttribute('font-size', '10');
    textEl.setAttribute('font-family', "'JetBrains Mono', 'Fira Code', monospace");
    textEl.setAttribute('font-weight', '500');
    textEl.textContent = text;

    // Background rect — sized by text length estimate
    const padding = 8;
    const charW = 6.2;
    const w = text.length * charW + padding * 2;
    const h = 20;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x - w / 2));
    rect.setAttribute('y', String(y - h / 2));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', 'rgba(20, 15, 40, 0.92)');
    rect.setAttribute('stroke', 'rgba(167, 139, 250, 0.3)');
    rect.setAttribute('stroke-width', '1');

    group.appendChild(rect);
    group.appendChild(textEl);
    return group;
}

function _estimatePathLength(p1: { x: number, y: number }, p2: { x: number, y: number }): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy) * 1.3;  // rough bezier estimate
}

function _getLinePoint(card: HTMLElement, lineNum: number, side: 'left' | 'right'): { x: number; y: number } {
    const cardX = parseFloat(card.style.left) || 0;
    const cardY = parseFloat(card.style.top) || 0;
    const cardW = card.offsetWidth;
    const cardH = card.offsetHeight;

    // Try to find the specific line element
    const lineEl = card.querySelector(`.diff-line[data-line="${lineNum}"]`) as HTMLElement;
    const body = card.querySelector('.file-card-body') as HTMLElement;

    if (lineEl && body) {
        // Calculate line position relative to card
        const lineYInBody = lineEl.offsetTop - body.scrollTop;
        const headerH = body.offsetTop; // header above body

        const y = cardY + headerH + lineYInBody + lineEl.offsetHeight / 2;
        const x = side === 'left' ? cardX : cardX + cardW;

        // Clamp y to be within card bounds
        return {
            x,
            y: Math.max(cardY + 30, Math.min(cardY + cardH - 10, y)),
        };
    }

    // Fallback: estimate from line number
    const totalLines = card.querySelectorAll('.diff-line').length || 100;
    const pct = lineNum / totalLines;
    const headerH = 36;
    const bodyH = cardH - headerH;

    return {
        x: side === 'left' ? cardX : cardX + cardW,
        y: cardY + headerH + pct * bodyH,
    };
}

// ─── Navigate to connection endpoint ────────────────────
export function navigateToConnection(ctx: CanvasContext, conn: any, navigateTo: 'source' | 'target' = 'target') {
    measure('connection:navigate', () => {
        const file = navigateTo === 'target' ? conn.targetFile : conn.sourceFile;
        const line = navigateTo === 'target' ? conn.targetLineStart : conn.sourceLineStart;
        const targetCard = ctx.fileCards.get(file);
        if (!targetCard) return;

        // Pan canvas to center on the target card
        const vpRect = ctx.canvasViewport.getBoundingClientRect();
        const state = ctx.snap().context;
        const cardX = parseFloat(targetCard.style.left) || 0;
        const cardY = parseFloat(targetCard.style.top) || 0;
        const newOffsetX = -(cardX + targetCard.offsetWidth / 2) * state.zoom + vpRect.width / 2;
        const newOffsetY = -(cardY + targetCard.offsetHeight / 2) * state.zoom + vpRect.height / 2;

        ctx.actor.send({ type: 'SET_OFFSET', x: newOffsetX, y: newOffsetY });
        updateCanvasTransform(ctx);

        // Scroll to target line inside the card
        const body = targetCard.querySelector('.file-card-body') as HTMLElement;
        const lineEl = targetCard.querySelector(`.diff-line[data-line="${line}"]`) as HTMLElement;
        if (body && lineEl) {
            const pre = body.querySelector('pre') as HTMLElement || body;
            const preRect = pre.getBoundingClientRect();
            const lineRect = lineEl.getBoundingClientRect();
            const zoom = preRect.height / pre.clientHeight || 1;
            pre.scrollTop += (lineRect.top - preRect.top) / zoom;
        }

        // Flash the target line
        targetCard.querySelectorAll('.diff-line').forEach(l => {
            const ln = parseInt((l as HTMLElement).dataset.line);
            if (ln === line) {
                l.classList.add('line-flash');
                setTimeout(() => l.classList.remove('line-flash'), 1500);
            }
        });
    });
}

// ─── Save connections to server ─────────────────────────
export async function saveConnections(ctx: CanvasContext) {
    const state = ctx.snap().context;
    try {
        await fetch('/api/connections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connections: state.connections })
        });
    } catch (e) {
        measure('connections:saveError', () => e);
    }
}

// ─── Load connections from server ───────────────────────
export async function loadConnections(ctx: CanvasContext) {
    return measure('connections:load', async () => {
        try {
            const response = await fetch('/api/connections');
            if (!response.ok) return;
            const data = await response.json();

            if (data.connections && data.connections.length > 0) {
                const conns = data.connections.map(c => ({
                    id: c.conn_id,
                    sourceFile: c.source_file,
                    sourceLineStart: c.source_line_start,
                    sourceLineEnd: c.source_line_end,
                    targetFile: c.target_file,
                    targetLineStart: c.target_line_start,
                    targetLineEnd: c.target_line_end,
                    comment: c.comment || '',
                }));

                conns.forEach(conn => {
                    ctx.actor.send({
                        type: 'START_CONNECTION',
                        sourceFile: conn.sourceFile,
                        lineStart: conn.sourceLineStart,
                        lineEnd: conn.sourceLineEnd,
                    });
                    ctx.actor.send({
                        type: 'COMPLETE_CONNECTION',
                        targetFile: conn.targetFile,
                        lineStart: conn.targetLineStart,
                        lineEnd: conn.targetLineEnd,
                        comment: conn.comment,
                    });
                });

                renderConnections(ctx);
                buildConnectionMarkers(ctx);
            }
        } catch (e) {
            measure('connections:loadError', () => e);
        }
    });
}

// ─── Delete a connection ────────────────────────────────
export function deleteConnection(ctx: CanvasContext, connId: string) {
    ctx.actor.send({ type: 'DELETE_CONNECTION', id: connId });
    renderConnections(ctx);
    buildConnectionMarkers(ctx);
    saveConnections(ctx);
}

// ─── Legacy compat: setupConnectionDrag (now no-op) ─────
export function setupConnectionDrag(ctx: CanvasContext, card: HTMLElement, filePath: string) {
    // Replaced by setupLineClickConnection
    setupLineClickConnection(ctx, card, filePath);
}
