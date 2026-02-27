// @ts-nocheck
/**
 * Connections — click-on-line to connect, render SVG lines,
 * left-side marker strip, navigate.
 *
 * Flow:
 *   1. User clicks a line number/gutter → starts pending connection (source)
 *   2. All cards show a subtle "click a target line" hint
 *   3. User clicks a line in another card → completes connection
 *   4. Connection markers appear on the LEFT side of both cards
 *   5. SVG bezier curves connect the two lines across the canvas
 */
import { measure } from 'measure-fn';
import { render } from 'melina/client';
import type { CanvasContext } from './context';
import { escapeHtml, showToast } from './utils';
import { updateCanvasTransform, updateZoomUI } from './canvas';

// ─── Pending connection state ────────────────────────────
let pendingConnection: {
    sourceFile: string;
    sourceLine: number;
    sourceCard: HTMLElement;
} | null = null;

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
            const conn = {
                id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                sourceFile: pendingConnection.sourceFile,
                sourceLineStart: pendingConnection.sourceLine,
                sourceLineEnd: pendingConnection.sourceLine,
                targetFile: filePath,
                targetLineStart: lineNum,
                targetLineEnd: lineNum,
                comment: '',
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
            showToast(`Connected ${conn.sourceFile}:${conn.sourceLineStart} → ${conn.targetFile}:${conn.targetLineStart}`, 'success');
            return;
        }

        // If clicking same card and already pending → cancel
        if (pendingConnection && pendingConnection.sourceCard === card) {
            _clearPending(ctx);
            showToast('Connection cancelled', 'info');
            return;
        }

        // Start a new pending connection
        e.stopPropagation();
        pendingConnection = { sourceFile: filePath, sourceLine: lineNum, sourceCard: card };

        // Visual: highlight the source line
        lineEl.classList.add('connection-source-line');
        card.classList.add('connecting-source');

        // Highlight all other cards as potential targets
        ctx.fileCards.forEach((c, p) => {
            if (p !== filePath) c.classList.add('connect-target-ready');
        });

        showToast(`Click a line in another file to connect from ${filePath.split('/').pop()}:${lineNum}`, 'info');
    });
}

function _clearPending(ctx: CanvasContext) {
    if (!pendingConnection) return;
    // Remove visual highlights
    pendingConnection.sourceCard.querySelector('.connection-source-line')?.classList.remove('connection-source-line');
    pendingConnection.sourceCard.classList.remove('connecting-source');
    ctx.fileCards.forEach((c) => c.classList.remove('connect-target-ready'));
    pendingConnection = null;
}

// ─── Cancel pending connection (called from Escape key) ──
export function cancelPendingConnection(ctx: CanvasContext) {
    if (pendingConnection) {
        _clearPending(ctx);
        showToast('Connection cancelled', 'info');
    }
}

export function hasPendingConnection(): boolean {
    return pendingConnection !== null;
}

// ─── Build connection marker strips (LEFT side of cards) ─
export function buildConnectionMarkers(ctx: CanvasContext) {
    const state = ctx.snap().context;
    const connections = state.connections || [];
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

        // Remove existing connection markers
        card.querySelector('.conn-marker-strip')?.remove();

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
            marker.title = `${role === 'source' ? '→' : '←'} ${role === 'source' ? conn.targetFile : conn.sourceFile}:${role === 'source' ? conn.targetLineStart : conn.sourceLineStart}`;

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                navigateToConnection(ctx, conn, role === 'source' ? 'target' : 'source');
            });

            strip.appendChild(marker);
        });

        body.appendChild(strip);
    });
}

// ─── Render all SVG connection lines ────────────────────
export function renderConnections(ctx: CanvasContext) {
    if (!ctx.svgOverlay) return;
    ctx.svgOverlay.innerHTML = '';

    const state = ctx.snap().context;
    const connections = state.connections || [];

    connections.forEach(conn => {
        const sourceCard = ctx.fileCards.get(conn.sourceFile);
        const targetCard = ctx.fileCards.get(conn.targetFile);
        if (!sourceCard || !targetCard) return;

        // Get canvas-space coordinates for the line endpoints
        const startPt = _getLinePoint(sourceCard, conn.sourceLineStart, 'left');
        const endPt = _getLinePoint(targetCard, conn.targetLineStart, 'left');

        // Bezier curve connecting the two points (exits left side)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dx = Math.abs(endPt.x - startPt.x);
        const ctrlOffset = Math.max(80, dx * 0.4);

        const d = `M ${startPt.x} ${startPt.y} C ${startPt.x - ctrlOffset} ${startPt.y}, ${endPt.x - ctrlOffset} ${endPt.y}, ${endPt.x} ${endPt.y}`;
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#a78bfa');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.6');
        path.style.cursor = 'pointer';
        path.style.pointerEvents = 'stroke';

        // Hover effect
        path.addEventListener('mouseenter', () => {
            path.setAttribute('stroke-width', '3.5');
            path.setAttribute('opacity', '1');
        });
        path.addEventListener('mouseleave', () => {
            path.setAttribute('stroke-width', '2');
            path.setAttribute('opacity', '0.6');
        });
        path.addEventListener('click', () => navigateToConnection(ctx, conn, 'target'));

        ctx.svgOverlay.appendChild(path);

        // Small circles at endpoints
        [startPt, endPt].forEach(pt => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', String(pt.x));
            circle.setAttribute('cy', String(pt.y));
            circle.setAttribute('r', '4');
            circle.setAttribute('fill', '#a78bfa');
            circle.setAttribute('opacity', '0.8');
            ctx.svgOverlay.appendChild(circle);
        });

        // Comment label if present
        if (conn.comment) {
            const labelX = (startPt.x + endPt.x) / 2 - ctrlOffset / 2;
            const labelY = (startPt.y + endPt.y) / 2;

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.style.cursor = 'pointer';
            group.addEventListener('click', () => navigateToConnection(ctx, conn, 'target'));

            const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textEl.setAttribute('x', String(labelX));
            textEl.setAttribute('y', String(labelY));
            textEl.setAttribute('text-anchor', 'middle');
            textEl.setAttribute('alignment-baseline', 'middle');
            textEl.setAttribute('fill', '#e0e0e0');
            textEl.setAttribute('font-size', '11');
            textEl.setAttribute('font-family', 'Inter, sans-serif');
            textEl.textContent = conn.comment;

            const bbox = { width: conn.comment.length * 7 + 12, height: 20 };
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', String(labelX - bbox.width / 2));
            rect.setAttribute('y', String(labelY - bbox.height / 2));
            rect.setAttribute('width', String(bbox.width));
            rect.setAttribute('height', String(bbox.height));
            rect.setAttribute('rx', '6');
            rect.setAttribute('fill', 'rgba(30, 20, 50, 0.85)');

            group.appendChild(rect);
            group.appendChild(textEl);
            ctx.svgOverlay.appendChild(group);
        }
    });
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
        const lineRect = lineEl.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
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

        showToast(`→ ${file.split('/').pop()}:${line}`, 'info');
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
                showToast(`Loaded ${conns.length} connection${conns.length > 1 ? 's' : ''}`, 'info');
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
    showToast('Connection deleted', 'info');
}

// ─── Legacy compat: setupConnectionDrag (now no-op) ─────
export function setupConnectionDrag(ctx: CanvasContext, card: HTMLElement, filePath: string) {
    // Replaced by setupLineClickConnection
    setupLineClickConnection(ctx, card, filePath);
}
